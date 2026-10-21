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

    print('Reloading page...')
    await send('Page.reload')
    await asyncio.sleep(4)
    
    # Click Memory Drawer button
    await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bộ nhớ'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)
    
    # Click 'Chờ duyệt (' button
    await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Chờ duyệt ('));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)
    
    # Check buttons
    res = await send('Runtime.evaluate', {
        'expression': 'Array.from(document.querySelectorAll("button")).map(b => b.textContent.trim()).filter(b => b.includes("Duyệt nhóm") || b.includes("Kích hoạt"))',
        'returnByValue': True
    })
    print('Buttons after reload:', res.get('result', {}).get('value'))
    
    # Try clicking the first 'Duyệt nhóm đã kiểm tra'
    click_res = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Duyệt nhóm đã kiểm tra') && !b.disabled);
            if (btn) {
                btn.click();
                return { clicked: true, text: btn.textContent.trim() };
            }
            return { clicked: false };
        })()""",
        'returnByValue': True
    })
    print('Clicked next group:', click_res.get('result', {}).get('value'))
    await asyncio.sleep(4)
    
    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
