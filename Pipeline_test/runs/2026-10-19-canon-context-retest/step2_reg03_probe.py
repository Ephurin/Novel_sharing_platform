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

PROBE_NOVEL_ID = '2e0e9175-4093-4462-b37f-59e8ef7a13f1'
PROBE_CH01_ID = '9295eeb3-efdd-40c9-83be-ea4983b883b7'

PROBE_TEXT = "An ký hợp đồng kiểm định trạm bơm với ông Hòa trong thời hạn mười hai ngày. Sau đó, ông Hòa trao cho An chiếc chìa khóa đồng của kho vật tư."

async def run():
    print("=== REG-03: Bootstrapping Probe Project ===")
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

    # 1. Navigate to IDE for probe novel
    ide_url = f"http://localhost:18080/author/ide?novelId={PROBE_NOVEL_ID}&chapterId={PROBE_CH01_ID}"
    print(f"1. Navigating to Author IDE: {ide_url}")
    await cdp('Runtime.evaluate', {'expression': f"window.location.href = '{ide_url}'"})
    await asyncio.sleep(4)

    # 2. Fill Chapter 1
    print("2. Filling Chapter 1 content...")
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

    # 3. Open Memory drawer
    print("3. Opening Memory drawer...")
    await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Bộ nhớ'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)

    # 4. Click Setup tab
    print("4. Clicking 'Trích xuất' (setup) tab...")
    await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Trích xuất'));
            if (tab) tab.click();
        })()"""
    })
    await asyncio.sleep(2)

    # 5. Click "Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu"
    print("5. Clicking bootstrap button...")
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

    # Wait for bootstrap job to start
    await asyncio.sleep(3)

    # Capture screenshot
    shot = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg03_probe_extract_started.png').write_bytes(base64.b64decode(shot['data']))
    print("Saved evidence/reg03_probe_extract_started.png")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(run())
