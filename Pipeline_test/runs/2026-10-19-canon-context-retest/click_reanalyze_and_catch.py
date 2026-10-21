import asyncio
import json
import pathlib
import sys
import urllib.request
import websockets

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

async def run():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and '18080' in t.get('url', '')]
    ws = await websockets.connect(pages[0]['webSocketDebuggerUrl'], max_size=50*1024*1024)
    msg_id = 0

    async def cdp_call(method, params=None):
        nonlocal msg_id
        msg_id += 1
        cur_id = msg_id
        await ws.send(json.dumps({'id': cur_id, 'method': method, 'params': params or {}}))
        while True:
            raw = await ws.recv()
            data = json.loads(raw)
            if data.get('id') == cur_id:
                if 'error' in data:
                    raise RuntimeError(f"CDP error: {data['error']}")
                return data.get('result', {})

    expr = """
    (async () => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent && b.textContent.includes('Phân tích lại chương đang mở')
        );
        if (!btn) return { error: 'button not found' };
        if (btn.disabled) return { error: 'button is disabled' };
        
        try {
            btn.click();
            return { success: true, text: btn.textContent.trim() };
        } catch (e) {
            return { error: e.message };
        }
    })()
    """
    res = (await cdp_call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}))['result']['value']
    print("Click result:", res)
    await asyncio.sleep(4)

    # Check alert or message
    msg = (await cdp_call('Runtime.evaluate', {
        'expression': "(() => { const el = document.querySelector('.mantine-Alert-root, [role=\"alert\"]'); return el ? el.innerText : 'no alert'; })()",
        'returnByValue': True
    }))['result']['value']
    print("Alert message on UI:", msg)

    await ws.close()

asyncio.run(run())
