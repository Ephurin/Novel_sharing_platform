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
    
    res = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Duyệt nhóm'));
            return btns.map((b, idx) => {
                const card = b.closest('.mantine-Paper-root') || b.parentElement;
                return {
                    idx: idx,
                    text: card ? card.innerText.split('\\n').filter(Boolean).slice(0, 15) : []
                };
            });
        })()""",
        'returnByValue': True
    })
    for item in res.get('result', {}).get('value', []):
        print(f"=== CARD {item['idx']} ===")
        for l in item['text']:
            print("  ", l)
    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
