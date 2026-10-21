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

async def main():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    ws_url = pages[0]['webSocketDebuggerUrl']
    ws = await websockets.connect(ws_url, max_size=100*1024*1024)
    
    async def send(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        await ws.send(json.dumps(msg))
        return json.loads(await ws.recv()).get('result', {})
    
    # Click 'Chờ duyệt (' button
    res = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Chờ duyệt ('));
            if (btn) {
                btn.click();
                return btn.textContent.trim();
            }
            return null;
        })()"""
    })
    print("Clicked button:", res.get('result', {}).get('value'))
    await asyncio.sleep(2)
    
    # Capture screenshot
    ss = await send('Page.captureScreenshot', {'format': 'png'})
    data = base64.b64decode(ss['data'])
    (EVIDENCE_DIR / 's02_review_queue_opened.png').write_bytes(data)
    print("Saved evidence/s02_review_queue_opened.png")
    
    # Inspect proposals visible in DOM
    eval_res = await send('Runtime.evaluate', {
        'expression': """(() => {
            const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean);
            const reviewButtons = buttons.filter(b => b.includes('Duyệt') || b.includes('Từ chối') || b.includes('Kích hoạt') || b.includes('baseline') || b.includes('Đã có'));
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong')).map(el => el.textContent.trim()).filter(Boolean);
            return {
                reviewButtons: reviewButtons.slice(0, 30),
                headings: headings.slice(0, 30)
            };
        })()""",
        'returnByValue': True
    })
    print("Review UI Elements:", json.dumps(eval_res.get('result', {}).get('value'), indent=2, ensure_ascii=False))
    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
