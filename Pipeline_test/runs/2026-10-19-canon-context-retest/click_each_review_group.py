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
P1_M0_DIR = EVIDENCE_DIR / 'memory' / 'P1-M0'

async def main():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    ws_url = pages[0]['webSocketDebuggerUrl']
    ws = await websockets.connect(ws_url, max_size=100*1024*1024)
    
    async def send(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        await ws.send(json.dumps(msg))
        return json.loads(await ws.recv()).get('result', {})

    async def click_element(button_text):
        expr = f"""(() => {{
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('{button_text}') && !b.disabled);
            if (!btn) return {{ found: false }};
            btn.scrollIntoView({{ block: 'center', behavior: 'instant' }});
            
            const rect = btn.getBoundingClientRect();
            const opts = {{ bubbles: true, cancelable: true, view: window, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }};
            btn.dispatchEvent(new PointerEvent('pointerdown', opts));
            btn.dispatchEvent(new MouseEvent('mousedown', opts));
            btn.dispatchEvent(new PointerEvent('pointerup', opts));
            btn.dispatchEvent(new MouseEvent('mouseup', opts));
            btn.click();
            return {{ found: true, text: btn.textContent.trim() }};
        }})()"""
        res = await send('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
        return res.get('result', {}).get('value', {})

    print("Attempting to click remaining 'Duyệt nhóm đã kiểm tra' buttons...")
    for step in range(6):
        res = await click_element('Duyệt nhóm đã kiểm tra')
        print(f"Step {step+1}: {res}")
        if not res.get('found'):
            print("No more enabled 'Duyệt nhóm đã kiểm tra' buttons found.")
            break
        await asyncio.sleep(4)

    # Check activation button
    check_act = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kích hoạt bộ nhớ'));
            return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
        })()""",
        'returnByValue': True
    })
    print("Activation button status:", check_act.get('result', {}).get('value'))

    # If enabled, click it
    if check_act.get('result', {}).get('value', {}).get('disabled') is False:
        print("Clicking 'Kích hoạt bộ nhớ sau duyệt'...")
        act_res = await click_element('Kích hoạt bộ nhớ')
        print("Activation clicked:", act_res)
        await asyncio.sleep(5)

    # Capture screenshot
    ss = await send('Page.captureScreenshot', {'format': 'png'})
    data = base64.b64decode(ss['data'])
    (EVIDENCE_DIR / 's03_baseline_activated.png').write_bytes(data)
    (P1_M0_DIR / 's03_baseline_activated.png').write_bytes(data)
    print("Saved evidence/s03_baseline_activated.png")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
