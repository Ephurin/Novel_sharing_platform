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
    
    # Inspect groups
    info = await send('Runtime.evaluate', {
        'expression': """(() => {
            const groupSections = Array.from(document.querySelectorAll('section, [class*="group"], [class*="card"]'))
                .filter(el => el.querySelector('button') && el.textContent.includes('Duyệt'));
            
            const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
                text: b.textContent.trim(),
                disabled: b.disabled,
                classes: b.className
            }));
            
            return {
                groupsCount: groupSections.length,
                actionButtons: buttons.filter(b => b.text.includes('Duyệt') || b.text.includes('Từ chối') || b.text.includes('Kích hoạt'))
            };
        })()""",
        'returnByValue': True
    })
    print("UI Groups Info:", json.dumps(info.get('result', {}).get('value'), indent=2, ensure_ascii=False))
    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
