import asyncio
import base64
import json
import pathlib
import sys
import urllib.request
import websockets

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
EVIDENCE_DIR = RUN_DIR / 'evidence'

async def run():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and '18080' in t.get('url', '')]
    ws = await websockets.connect(pages[0]['webSocketDebuggerUrl'], max_size=50*1024*1024)
    msg_id = 0

    async def cdp_call(method, params=None):
        nonlocal msg_id
        msg_id += 1
        cur_id = msg_id
        await ws.send(json.dumps({'id': cur_id, 'method': method, 'params': params or {}}))
        while True:
            raw = await ws.recv()
            data = json.loads(raw)
            if data.get('id') == cur_id:
                if 'error' in data:
                    raise RuntimeError(f"CDP error: {data['error']}")
                return data.get('result', {})

    # Click on the Memory drawer / icon
    expr = """
    (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.innerText.includes('Bộ nhớ') || b.innerText.includes('Memory') || b.getAttribute('title')?.includes('Bộ nhớ')
        );
        if (btn) {
            btn.click();
            return 'clicked: ' + btn.innerText;
        }
        return 'not found';
    })()
    """
    res = await cdp_call('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
    print("Drawer button:", res.get('result', {}).get('value'))
    await asyncio.sleep(2)

    # Click "Đang chờ duyệt" tab if available
    expr_tab = """
    (() => {
        const tab = Array.from(document.querySelectorAll('button, [role="tab"]')).find(b => 
            b.innerText.includes('Đang chờ duyệt') || b.innerText.includes('Duyệt') || b.innerText.includes('Review')
        );
        if (tab) {
            tab.click();
            return 'clicked tab: ' + tab.innerText;
        }
        return 'tab not found';
    })()
    """
    res_tab = await cdp_call('Runtime.evaluate', {'expression': expr_tab, 'returnByValue': True})
    print("Review tab:", res_tab.get('result', {}).get('value'))
    await asyncio.sleep(2)

    # Inspect groups and texts
    info = await cdp_call('Runtime.evaluate', {
        'expression': """
        (() => {
            const body = document.body.innerText;
            const hasReuseLabel = body.includes('Đã có trong canon — giữ nguyên') || body.includes('giữ nguyên') || body.includes('Đã có trong canon');
            const groups = Array.from(document.querySelectorAll('.border, [data-testid="proposal-group"]')).map(el => el.innerText.slice(0, 100));
            return { hasReuseLabel, textSnippet: body.slice(0, 500), groupsCount: groups.length };
        })()
        """,
        'returnByValue': True
    })
    print("UI Review Info:", info.get('result', {}).get('value'))

    shot = await cdp_call('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg02_review_queue_ui.png').write_bytes(base64.b64decode(shot['data']))
    print("Screenshot saved to evidence/reg02_review_queue_ui.png")

    await ws.close()

asyncio.run(run())
