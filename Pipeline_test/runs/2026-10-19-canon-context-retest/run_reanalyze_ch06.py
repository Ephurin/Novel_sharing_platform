import asyncio
import base64
import json
import pathlib
import sys
import time
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
                    raise RuntimeError(f"CDP {method} error: {data['error']}")
                return data.get('result', {})

    print("Connected to Author IDE.")

    # 1. Ensure Memory drawer is open
    await cdp_call('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Bộ nhớ'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)

    # 2. Click "Phân tích lại chương đang mở"
    click_reanalyze = """
    (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent && b.textContent.includes('Phân tích lại chương đang mở')
        );
        if (btn) {
            btn.click();
            return 'clicked: ' + btn.textContent.trim();
        }
        return 'not found';
    })()
    """
    res = (await cdp_call('Runtime.evaluate', {'expression': click_reanalyze}))['result']['value']
    print("Reanalyze button click:", res)
    await asyncio.sleep(3)

    # Take screenshot
    shot = await cdp_call('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg06_reanalyze_clicked.png').write_bytes(base64.b64decode(shot['data']))
    print("Saved evidence/reg06_reanalyze_clicked.png")

    await ws.close()

asyncio.run(run())
