import asyncio
import json
import pathlib
import sys
import urllib.request
import websockets

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'
CH01_ID = '51007a3b-a541-4ee8-9d09-619d56553d37'

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
                    raise RuntimeError(data['error'])
                return data.get('result', {})

    fill_expr = """
    (() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const emailInput = inputs.find(i => i.type === 'text' || i.type === 'email');
        const passInput = inputs.find(i => i.type === 'password');
        if (!emailInput || !passInput) return 'inputs missing';

        const setVal = (el, val) => {
            const proto = window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        setVal(emailInput, 'reader02@example.com');
        setVal(passInput, 'StrongPassword123!');

        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Login') || b.type === 'submit');
        if (btn) {
            btn.click();
            return 'clicked login';
        }
        return 'login button missing';
    })()
    """
    res = (await cdp_call('Runtime.evaluate', {'expression': fill_expr}))['result']['value']
    print("Login submission:", res)
    await asyncio.sleep(4)

    # Check new URL / token
    info = await cdp_call('Runtime.evaluate', {
        'expression': "({ url: window.location.href, token: localStorage.getItem('ephurin_access_token') })",
        'returnByValue': True
    })
    print("Post-login info:", info['result']['value'])

    # Navigate to Author IDE
    ide_url = f"http://localhost:18080/author/ide?novelId={NOVEL_ID}&chapterId={CH01_ID}"
    print(f"Navigating to {ide_url}...")
    await cdp_call('Runtime.evaluate', {'expression': f"window.location.href = '{ide_url}'"})
    await asyncio.sleep(4)

    final_info = await cdp_call('Runtime.evaluate', {
        'expression': "({ url: window.location.href, title: document.title })",
        'returnByValue': True
    })
    print("Final Author IDE info:", final_info['result']['value'])
    await ws.close()

asyncio.run(run())
