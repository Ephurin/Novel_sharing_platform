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
P1_M0_DIR.mkdir(parents=True, exist_ok=True)

async def main():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    ws_url = pages[0]['webSocketDebuggerUrl']
    ws = await websockets.connect(ws_url, max_size=100*1024*1024)
    
    async def send(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        await ws.send(json.dumps(msg))
        return json.loads(await ws.recv()).get('result', {})

    print("Reviewing groups in UI one by one...")

    # We approve group by group
    for i in range(10): # up to 10 iterations in case groups reload
        # Find first enabled 'Duyệt nhóm đã kiểm tra' button
        btn_info = await send('Runtime.evaluate', {
            'expression': """(() => {
                const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Duyệt nhóm đã kiểm tra') && !b.disabled);
                if (btns.length > 0) {
                    btns[0].click();
                    return { clicked: true, remaining: btns.length - 1 };
                }
                return { clicked: false, remaining: 0 };
            })()""",
            'returnByValue': True
        })
        val = btn_info.get('result', {}).get('value', {})
        if not val.get('clicked'):
            print("No more enabled 'Duyệt nhóm đã kiểm tra' buttons found.")
            break
        print(f"Approved a group! Remaining groups: {val.get('remaining')}")
        await asyncio.sleep(2)

    # Now check 'Kích hoạt bộ nhớ sau duyệt' button
    act_btn_status = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kích hoạt bộ nhớ'));
            return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
        })()""",
        'returnByValue': True
    })
    print("Activation button status:", act_btn_status.get('result', {}).get('value'))

    # Click 'Kích hoạt bộ nhớ sau duyệt'
    print("Clicking 'Kích hoạt bộ nhớ sau duyệt' via UI...")
    clicked_act = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kích hoạt bộ nhớ') && !b.disabled);
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        })()""",
        'returnByValue': True
    })
    print("Activation button clicked:", clicked_act.get('result', {}).get('value'))
    await asyncio.sleep(4)

    # Capture screenshot
    ss = await send('Page.captureScreenshot', {'format': 'png'})
    data = base64.b64decode(ss['data'])
    ss_path = EVIDENCE_DIR / 's03_baseline_activated.png'
    ss_path.write_bytes(data)
    (P1_M0_DIR / 's03_baseline_activated.png').write_bytes(data)
    print(f"Saved screenshot to {ss_path}")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
