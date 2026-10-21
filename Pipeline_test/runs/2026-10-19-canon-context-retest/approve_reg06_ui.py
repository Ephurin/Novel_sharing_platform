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
REG06_DIR = EVIDENCE_DIR / 'memory' / 'REG-06'
REG06_DIR.mkdir(parents=True, exist_ok=True)

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

    # Ensure Memory Drawer is open
    await cdp_call('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Bộ nhớ'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)

    # Click "Chờ duyệt"
    await cdp_call('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Chờ duyệt'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)

    # Click "Duyệt nhóm đã kiểm tra"
    expr = """
    (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.innerText.includes('Duyệt nhóm') || b.innerText.includes('Duyệt')
        );
        if (btn) {
            btn.click();
            return 'clicked: ' + btn.innerText;
        }
        return 'not found';
    })()
    """
    res = (await cdp_call('Runtime.evaluate', {'expression': expr, 'returnByValue': True}))['result']['value']
    print("Approval button click:", res)
    await asyncio.sleep(4)

    # Take screenshot
    shot = await cdp_call('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg06_group_approved.png').write_bytes(base64.b64decode(shot['data']))
    print("Saved evidence/reg06_group_approved.png")

    await ws.close()

asyncio.run(run())
