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
        'expression': 'Array.from(document.querySelectorAll("button")).map((b, i) => ({ i, text: b.textContent.trim(), disabled: b.disabled })).filter(x => x.text)',
        'returnByValue': True
    })
    for b in res.get('result', {}).get('value', []):
        print(f"[{b['i']}] (disabled={b['disabled']}): {b['text'][:50]}")
    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
