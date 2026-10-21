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
    ws = await websockets.connect(pages[0]['webSocketDebuggerUrl'], max_size=50*1024*1024)

    expr = """(() => {
        const panels = Array.from(document.querySelectorAll('[role="tabpanel"]')).map(p => ({
            id: p.id,
            attributes: Array.from(p.attributes).map(a => `${a.name}=${a.value}`),
            text: p.innerText.slice(0, 150)
        }));
        return panels;
    })()"""
    await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
    res = json.loads(await ws.recv())
    print("Panels:", json.dumps(res.get('result', {}).get('result', {}).get('value', []), indent=2, ensure_ascii=False))

    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
