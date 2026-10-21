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

    # Evaluate groups
    expr = """(() => {
        const cards = Array.from(document.querySelectorAll('.mantine-Card-root'));
        return cards.map((c, idx) => {
            const approveBtn = Array.from(c.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Duyệt nhóm'));
            return {
                idx,
                hasApprove: !!approveBtn,
                btnText: approveBtn ? approveBtn.textContent.trim() : null,
                content: c.innerText.slice(0, 150)
            };
        }).filter(x => x.hasApprove);
    })()"""
    await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
    res = json.loads(await ws.recv())
    groups = res.get('result', {}).get('result', {}).get('value', [])
    print(f"Total proposal groups in UI: {len(groups)}")
    for g in groups:
        print(f"\nGroup {g['idx']}:")
        print(g['content'])
    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
