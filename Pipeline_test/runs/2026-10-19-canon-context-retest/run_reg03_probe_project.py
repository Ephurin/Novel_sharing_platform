import asyncio
import base64
import json
import pathlib
import sys
import time
import urllib.request
import websockets
import subprocess

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
EVIDENCE_DIR = RUN_DIR / 'evidence'
REG03_DIR = EVIDENCE_DIR / 'memory' / 'REG-03'
REG03_DIR.mkdir(parents=True, exist_ok=True)

PROBE_TEXT = "An ký hợp đồng kiểm định trạm bơm với ông Hòa trong thời hạn mười hai ngày. Sau đó, ông Hòa trao cho An chiếc chìa khóa đồng của kho vật tư."

async def run():
    print("=== REG-03: Supersession Probe on Dedicated Project ===")
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    ws = await websockets.connect(pages[0]['webSocketDebuggerUrl'], max_size=50*1024*1024)
    msg_id = 0

    async def cdp(method, params=None):
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

    # 1. Navigate to /author
    print("1. Navigating to Author Projects page: http://localhost:18080/author")
    await cdp('Runtime.evaluate', {'expression': "window.location.href = 'http://localhost:18080/author'"})
    await asyncio.sleep(3)

    # 2. Click "New Project"
    print("2. Clicking 'New Project' button...")
    click_new = """(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('New Project'));
        if (btn) {
            btn.click();
            return 'clicked New Project';
        }
        return 'New Project button not found';
    })()"""
    res = (await cdp('Runtime.evaluate', {'expression': click_new}))['result']['value']
    print("New Project click:", res)
    await asyncio.sleep(4)

    # 3. Check current URL (should be /author/ide?novelId=...&chapterId=...)
    cur_url = (await cdp('Runtime.evaluate', {'expression': "window.location.href"}))['result']['value']
    print("Current URL:", cur_url)

    # Extract novelId and chapterId
    probe_novel_id = None
    if 'novelId=' in cur_url:
        parsed = urllib.parse.urlparse(cur_url)
        params = urllib.parse.parse_qs(parsed.query)
        probe_novel_id = params.get('novelId', [None])[0]
    print(f"Probe Novel ID: {probe_novel_id}")

    # 4. Fill Chapter 1 with PROBE_TEXT
    print("4. Filling Chapter 1 content...")
    fill_text = f"""(() => {{
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
        setVal(titleInput, "Chương 1 — Hợp đồng trạm bơm");
        setVal(bodyInput, {json.dumps(PROBE_TEXT)});
        return {{ title: titleInput.value, len: bodyInput.value.length }};
    }})()"""
    res_fill = (await cdp('Runtime.evaluate', {'expression': fill_text, 'returnByValue': True}))['result']['value']
    print("Filled probe chapter:", res_fill)

    print("Waiting 5s for autosave debounce...")
    await asyncio.sleep(5)

    # 5. Open Memory drawer -> Setup tab
    print("5. Opening Memory drawer...")
    await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Bộ nhớ'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)

    # Click Setup tab
    print("Clicking 'Trích xuất' (setup) tab...")
    await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Trích xuất'));
            if (tab) tab.click();
        })()"""
    })
    await asyncio.sleep(2)

    # Click "Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu"
    print("Clicking 'Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu' button...")
    click_extract = """(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent && b.textContent.includes('Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu')
        );
        if (btn && !btn.disabled) {
            btn.click();
            return 'clicked bootstrap button';
        }
        return btn ? 'button disabled' : 'button not found';
    })()"""
    extract_res = (await cdp('Runtime.evaluate', {'expression': click_extract}))['result']['value']
    print("Extract button result:", extract_res)

    # Capture screenshot
    shot = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg03_probe_extract_clicked.png').write_bytes(base64.b64decode(shot['data']))
    print("Saved evidence/reg03_probe_extract_clicked.png")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(run())
