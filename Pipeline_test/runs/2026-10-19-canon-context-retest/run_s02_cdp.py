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
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'
CH01_ID = '51007a3b-a541-4ee8-9d09-619d56553d37'

async def get_active_page_ws():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    if not pages:
        raise RuntimeError('No open Chrome pages found')
    for p in pages:
        if '18080' in p.get('url', ''):
            return p['webSocketDebuggerUrl']
    return pages[0]['webSocketDebuggerUrl']

class CDPClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.msg_id = 0
        self.ws = None

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=100*1024*1024)

    async def send(self, method, params=None):
        self.msg_id += 1
        msg = {'id': self.msg_id, 'method': method, 'params': params or {}}
        await self.ws.send(json.dumps(msg))
        while True:
            raw = await self.ws.recv()
            data = json.loads(raw)
            if data.get('id') == self.msg_id:
                if 'error' in data:
                    raise RuntimeError(f"CDP Error in {method}: {data['error']}")
                return data.get('result', {})

    async def evaluate(self, expression, await_promise=False):
        res = await self.send('Runtime.evaluate', {
            'expression': expression,
            'awaitPromise': await_promise,
            'returnByValue': True
        })
        return res.get('result', {}).get('value')

    async def wait_for(self, expression, timeout=30, interval=0.5):
        start = time.time()
        while time.time() - start < timeout:
            try:
                res = await self.evaluate(expression)
                if res:
                    return res
            except Exception:
                pass
            await asyncio.sleep(interval)
        raise TimeoutError(f"Condition not met within {timeout}s: {expression}")

    async def capture_screenshot(self, filepath):
        res = await self.send('Page.captureScreenshot', {'format': 'png'})
        data = base64.b64decode(res['data'])
        filepath.write_bytes(data)
        print(f"Screenshot saved to {filepath} ({len(data)} bytes)")

    async def close(self):
        if self.ws:
            await self.ws.close()

async def run_s02():
    ws_url = await get_active_page_ws()
    client = CDPClient(ws_url)
    await client.connect()
    print("Connected to Chrome CDP.")

    url = await client.evaluate("window.location.href")
    print(f"Initial URL: {url}")

    if '/login' in url:
        print("Logging in as reader02@example.com...")
        await client.evaluate("""
            (() => {
                const emailInput = document.querySelector('input[type="email"]') || document.querySelectorAll('input')[0];
                const passwordInput = document.querySelector('input[type="password"]') || document.querySelectorAll('input')[1];
                const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Login') || b.textContent.includes('Đăng nhập'));
                
                const setVal = (el, val) => {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                };
                
                if (emailInput && passwordInput && submitBtn) {
                    setVal(emailInput, 'reader02@example.com');
                    setVal(passwordInput, 'StrongPassword123!');
                    submitBtn.click();
                    return true;
                }
                return false;
            })()
        """)
        await asyncio.sleep(3)
        url = await client.evaluate("window.location.href")
        print(f"URL after login: {url}")

    # Navigate to Author IDE for our novel
    target_ide_url = f"http://localhost:18080/author/ide?novelId={NOVEL_ID}&chapterId={CH01_ID}"
    if NOVEL_ID not in url:
        print(f"Navigating to {target_ide_url}...")
        await client.evaluate(f"window.location.href = '{target_ide_url}'")
        await asyncio.sleep(3)

    # Wait for Author IDE to mount
    await client.wait_for("Boolean(document.querySelector('textarea[placeholder*=\"Bắt đầu câu\"]'))")
    print("Author IDE is mounted and ready.")

    # Check if Memory Drawer button exists
    drawer_btn_text = await client.evaluate("""
        (() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bộ nhớ'));
            return btn ? btn.textContent.trim() : null;
        })()
    """)
    print(f"Drawer button found: {drawer_btn_text}")

    # Click Drawer button to open AuthorMemoryPanel
    print("Clicking drawer button to open AuthorMemoryPanel...")
    await client.evaluate("""
        (() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bộ nhớ'));
            if (btn) btn.click();
        })()
    """)
    await asyncio.sleep(2)

    # Screenshot drawer open
    await client.capture_screenshot(EVIDENCE_DIR / 's02_drawer_opened.png')

    # Inspect tabs inside memory drawer
    drawer_tabs = await client.evaluate("""
        (() => {
            const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean);
            return buttons;
        })()
    """)
    print("All buttons on page after drawer open:", drawer_tabs)

    # Switch to tab "Trích xuất" (setup)
    print("Switching to tab 'Trích xuất' (setup)...")
    await client.evaluate("""
        (() => {
            const tabBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Trích xuất'));
            if (tabBtn) tabBtn.click();
        })()
    """)
    await asyncio.sleep(1.5)

    # Screenshot tab Trích xuất
    await client.capture_screenshot(EVIDENCE_DIR / 's02_tab_setup.png')

    # Look for button "Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu"
    extract_btn_text = await client.evaluate("""
        (() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Trích xuất dữ liệu'));
            return btn ? btn.textContent.trim() : null;
        })()
    """)
    print(f"Extract button found: {extract_btn_text}")

    if not extract_btn_text:
        print("Extract button not found by text 'Trích xuất dữ liệu'. Listing all buttons:")
        all_btns = await client.evaluate("""
            Array.from(document.querySelectorAll('button')).map(b => ({ text: b.textContent.trim(), disabled: b.disabled }))
        """)
        print(json.dumps(all_btns, indent=2, ensure_ascii=False))
        await client.close()
        return

    # Click the extraction button!
    print("CLICKING 'Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu' via UI...")
    clicked = await client.evaluate("""
        (() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Trích xuất dữ liệu'));
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        })()
    """)
    print(f"Clicked extraction button: {clicked}")
    await asyncio.sleep(3)

    # Screenshot right after clicking
    await client.capture_screenshot(EVIDENCE_DIR / 's02_extraction_started.png')

    await client.close()

if __name__ == '__main__':
    asyncio.run(run_s02())
