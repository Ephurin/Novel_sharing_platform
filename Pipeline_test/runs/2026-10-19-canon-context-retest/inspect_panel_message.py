import asyncio
import json
import urllib.request
import websockets
import sys

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

    res = await send('Runtime.evaluate', {
        'expression': """(() => {
            const alerts = Array.from(document.querySelectorAll('.mantine-Alert-root, [class*="alert"], [class*="error"]')).map(a => a.textContent.trim());
            const texts = Array.from(document.querySelectorAll('p, span, div')).map(el => el.textContent.trim()).filter(t => t.includes('lỗi') || t.includes('Error') || t.includes('thất bại') || t.includes('xung đột') || t.includes('conflict'));
            return { alerts, texts: texts.slice(0, 10) };
        })()""",
        'returnByValue': True
    })
    print("Alerts & Error texts:", json.dumps(res.get('result', {}).get('value'), indent=2, ensure_ascii=False))
    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
