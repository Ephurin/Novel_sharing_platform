import asyncio
import base64
import json
import pathlib
import sys
import time
import urllib.request
import websockets

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
EVIDENCE_DIR = RUN_DIR / 'evidence'
REG06_DIR = EVIDENCE_DIR / 'memory' / 'REG-06'
REG06_DIR.mkdir(parents=True, exist_ok=True)

NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'

CH06_TITLE = "Chương 6 — Trạm bơm số Hai"
CH06_BODY = """Sáng hôm sau, An lại gặp Mai Linh tại trạm bơm số Hai. Cậu đưa cho cô một gói cơm nắm bọc lá chuối.

Linh nhận lấy gói cơm còn ấm. Cô hỏi An về đường nước cũ dẫn vào kho. An chỉ tay về phía những ống sắt rỉ sét nằm sát chân đê, bảo rằng nước ở đây đổi hướng theo con nước lớn ròng mỗi ngày hai bận."""

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
                    raise RuntimeError(f"CDP {method} error: {data['error']}")
                return data.get('result', {})

    print("Connected to Author IDE.")

    # 1. Click "+ Thêm chương mới"
    click_new = """
    (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Thêm chương mới'));
        if (btn) {
            btn.click();
            return 'clicked new chapter';
        }
        return 'not found';
    })()
    """
    res1 = (await cdp_call('Runtime.evaluate', {'expression': click_new}))['result']['value']
    print("New chapter button:", res1)
    await asyncio.sleep(3)

    # 2. Inject helper and fill Chapter 6
    fill_ch06 = f"""
    (() => {{
        const setVal = (el, val) => {{
            const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
        }};
        const titleInput = document.querySelector('input[placeholder*="tiêu đề"], input[placeholder*="Tiêu đề"]');
        const bodyInput = document.querySelector('textarea[placeholder*="Bắt đầu câu"]');
        if (!titleInput || !bodyInput) return {{ error: 'inputs not found' }};
        setVal(titleInput, {json.dumps(CH06_TITLE)});
        setVal(bodyInput, {json.dumps(CH06_BODY)});
        return {{ title: titleInput.value, bodyLen: bodyInput.value.length, words: bodyInput.value.trim().split(/\\s+/).length }};
    }})()
    """
    res2 = (await cdp_call('Runtime.evaluate', {'expression': fill_ch06, 'returnByValue': True}))['result']['value']
    print("Filled Chapter 6:", res2)

    # 3. Wait for autosave debounce + network
    print("Waiting 5s for Chapter 6 autosave...")
    await asyncio.sleep(5)

    # 4. Capture screenshot
    shot = await cdp_call('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg06_ch06_created.png').write_bytes(base64.b64decode(shot['data']))
    print("Saved evidence/reg06_ch06_created.png")

    await ws.close()

asyncio.run(run())
