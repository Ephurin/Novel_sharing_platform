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
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

async def run():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and '18080' in t.get('url', '')]
    if not pages:
        print("No page found")
        return
    ws = await websockets.connect(pages[0]['webSocketDebuggerUrl'], max_size=50*1024*1024)

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
                    raise RuntimeError(data['error'])
                return data.get('result', {})

    msg_id = 0

    # 1. Inspect current status text & buttons
    expr = """
    (() => {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
        const statusEl = document.querySelector('[data-testid="save-status"], .save-status, span:has-text("Đã lưu")') || 
                         Array.from(document.querySelectorAll('span, div')).find(el => el.innerText && el.innerText.includes('Đã lưu') || el.innerText && el.innerText.includes('lưu'));
        const statusText = statusEl ? statusEl.innerText.trim() : 'none';
        return { buttons, statusText };
    })()
    """
    res = await cdp_call('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
    print("Page info:", res.get('result', {}).get('value'))

    # 2. Focus editor and trigger Ctrl+S (no content changes)
    await cdp_call('Runtime.evaluate', {'expression': """
    (() => {
        const textarea = document.querySelector('textarea, [contenteditable="true"]');
        if (textarea) {
            textarea.focus();
            return 'focused';
        }
        return 'not found';
    })()
    """})

    # Dispatch Ctrl+S
    await cdp_call('Input.dispatchKeyEvent', {
        'type': 'keyDown',
        'modifiers': 2, # Ctrl
        'windowsVirtualKeyCode': 83,
        'code': 'KeyS',
        'key': 's'
    })
    await cdp_call('Input.dispatchKeyEvent', {
        'type': 'keyUp',
        'modifiers': 0,
        'windowsVirtualKeyCode': 83,
        'code': 'KeyS',
        'key': 's'
    })

    print("Sent Ctrl+S, waiting 4s...")
    await asyncio.sleep(4)

    # 3. Take screenshot
    shot = await cdp_call('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg01_resave_unchanged.png').write_bytes(base64.b64decode(shot['data']))
    print("Screenshot saved to evidence/reg01_resave_unchanged.png")

    await ws.close()

asyncio.run(run())
