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

    await send('Console.enable')
    await send('Log.enable')
    await send('Runtime.enable')

    # Click the button and check return or error
    res = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Duyệt nhóm đã kiểm tra') && !b.disabled);
            if (btns.length === 0) return { error: 'No buttons' };
            const b = btns[0];
            
            // Check if there are onclick listeners or react fiber
            const key = Object.keys(b).find(k => k.startsWith('__reactProps') || k.startsWith('__reactEventHandlers'));
            const props = key ? b[key] : null;
            
            try {
                b.click();
                return { success: true, hasReactProps: Boolean(props), hasOnClick: Boolean(props && props.onClick) };
            } catch (err) {
                return { error: err.message };
            }
        })()""",
        'returnByValue': True
    })
    print("Click evaluate result:", json.dumps(res.get('result', {}).get('value'), indent=2))
    
    # Listen for 3 seconds for console logs or errors
    await asyncio.sleep(3)
    
    # Read window errors if any
    errors = await send('Runtime.evaluate', {
        'expression': 'window.__lastErrors || []',
        'returnByValue': True
    })
    print("Window errors:", errors.get('result', {}).get('value'))
    
    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
