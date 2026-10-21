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
REG02_DIR = EVIDENCE_DIR / 'memory' / 'REG-02'
REG02_DIR.mkdir(parents=True, exist_ok=True)

NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'
CH01_ID = '51007a3b-a541-4ee8-9d09-619d56553d37'

APPEND_SCENE = "\n\nTối hôm đó, Mai Linh đi bộ dọc bờ kè đá và nhặt được một chiếc vỏ ốc xoắn màu tím tro do thủy triều đánh dạt lên bãi cát."

async def run():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and '18080' in t.get('url', '')]
    if not pages:
        raise RuntimeError("Author IDE tab not found")
    
    ws_url = pages[0]['webSocketDebuggerUrl']
    ws = await websockets.connect(ws_url, max_size=50*1024*1024)
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

    # 1. Check helper functions
    has_helpers = await cdp_call('Runtime.evaluate', {'expression': "Boolean(window.setReactVal)"})
    if not has_helpers.get('result', {}).get('value'):
        helper_code = (RUN_DIR / 'inject_chapters.js').read_text(encoding='utf-8')
        await cdp_call('Runtime.evaluate', {'expression': helper_code})
        print("Injected helpers.")

    # 2. Get current content and append scene
    expr_append = f"""
    (() => {{
        const textarea = document.querySelector('textarea[placeholder*="Bắt đầu câu"]');
        if (!textarea) return {{ error: 'textarea not found' }};
        const oldVal = textarea.value;
        const toAppend = {json.dumps(APPEND_SCENE)};
        const newVal = oldVal + toAppend;
        window.setReactVal(textarea, newVal);
        return {{
            oldLen: oldVal.length,
            newLen: newVal.length,
            appended: toAppend.length,
            words: newVal.trim().split(/\\s+/).length
        }};
    }})()
    """
    res = await cdp_call('Runtime.evaluate', {'expression': expr_append, 'returnByValue': True})
    print("Appended scene result:", res.get('result', {}).get('value'))

    # 3. Wait for autosave debounce (1.2s) + backend write + outbox event creation
    print("Waiting 5s for autosave...")
    await asyncio.sleep(5)

    # 4. Check UI status text
    status_text = await cdp_call('Runtime.evaluate', {
        'expression': "(() => { const el = document.querySelector('[data-testid=\"save-status\"], .save-status, span'); return el ? el.innerText : ''; })()",
        'returnByValue': True
    })
    print("Status text:", status_text.get('result', {}).get('value'))

    # 5. Capture screenshot of Author IDE with new scene
    shot = await cdp_call('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg02_scene_appended.png').write_bytes(base64.b64decode(shot['data']))
    print("Screenshot saved to evidence/reg02_scene_appended.png")

    await ws.close()

asyncio.run(run())
