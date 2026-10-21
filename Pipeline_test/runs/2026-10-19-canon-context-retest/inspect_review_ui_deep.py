import asyncio
import json
import pathlib
import sys
import urllib.request
import websockets

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent

async def inspect():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and '18080' in t.get('url', '')]
    ws = await websockets.connect(pages[0]['webSocketDebuggerUrl'])
    msg_id = 0
    async def call(m, p=None):
        nonlocal msg_id; msg_id += 1; cur = msg_id
        await ws.send(json.dumps({'id': cur, 'method': m, 'params': p or {}}))
        while True:
            r = json.loads(await ws.recv())
            if r.get('id') == cur: return r.get('result', {})

    expr = """(() => {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
            text: b.innerText.trim(),
            disabled: b.disabled,
            title: b.title
        })).filter(b => b.text.length > 0 && b.text.length < 50);

        const groupEls = Array.from(document.querySelectorAll('div')).filter(d => 
            d.innerText && (d.innerText.includes('Đề xuất cập nhật') || d.innerText.includes('nhóm') || d.innerText.includes('Đã có trong canon'))
        ).map(d => d.innerText.slice(0, 150));

        return { buttons, sampleGroupTexts: groupEls.slice(0, 5) };
    })()"""
    res = await call('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
    val = res.get('result', {}).get('value', {})
    print("Found buttons count:", len(val.get('buttons', [])))
    print("Buttons:", json.dumps(val.get('buttons', []), indent=2, ensure_ascii=False))
    print("Sample Group Texts:", json.dumps(val.get('sampleGroupTexts', []), indent=2, ensure_ascii=False))
    await ws.close()

asyncio.run(inspect())
