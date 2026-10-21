import asyncio
import json
import pathlib
import sys
import urllib.request
import websockets

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

async def main():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    ws_url = pages[0]['webSocketDebuggerUrl']
    ws = await websockets.connect(ws_url, max_size=100*1024*1024)
    
    async def send(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        await ws.send(json.dumps(msg))
        return json.loads(await ws.recv()).get('result', {})

    # Inspect buttons
    res = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Duyệt nhóm đã kiểm tra'));
            return btns.map((b, i) => ({
                idx: i,
                text: b.textContent.trim(),
                disabled: b.disabled,
                ariaDisabled: b.getAttribute('aria-disabled'),
                dataset: Object.assign({}, b.dataset)
            }));
        })()""",
        'returnByValue': True
    })
    print("Buttons found:", json.dumps(res.get('result', {}).get('value'), indent=2, ensure_ascii=False))

    # Click the FIRST button
    print("Clicking first button with event dispatch...")
    click_res = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Duyệt nhóm đã kiểm tra') && !b.disabled);
            if (btns.length > 0) {
                btns[0].scrollIntoView();
                btns[0].click();
                return { success: true, text: btns[0].textContent };
            }
            return { success: false };
        })()""",
        'returnByValue': True
    })
    print("Click result:", click_res.get('result', {}).get('value'))
    await asyncio.sleep(3)

    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
