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

CHAPTERS_DATA = json.loads((RUN_DIR / 'chapters_data.json').read_text(encoding='utf-8'))

async def get_active_page_ws():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    if not pages:
        raise RuntimeError('No open Chrome pages found')
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

    async def wait_for(self, expression, timeout=25, interval=0.5):
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

async def main():
    ws_url = await get_active_page_ws()
    client = CDPClient(ws_url)
    await client.connect()
    print("Connected to Chrome CDP.")

    # Target the newly created novel 735c3109-c0be-4512-96cf-da7382ce8d56
    novel_id = '735c3109-c0be-4512-96cf-da7382ce8d56'
    chapter_1_id = '51007a3b-a541-4ee8-9d09-619d56553d37'
    print(f"Using pristine novel created via UI: {novel_id}")

    # Navigate directly into Author IDE for Chapter 1
    ide_url = f"http://localhost:18080/author/ide?novelId={novel_id}&chapterId={chapter_1_id}"
    print(f"Navigating to Author IDE: {ide_url}")
    await client.evaluate(f"window.location.href = '{ide_url}'")

    # Wait for Author IDE to mount
    await client.wait_for("Boolean(document.querySelector('textarea[placeholder*=\"Bắt đầu câu\"]'))")
    print("Author IDE mounted successfully.")

    # Inject helper functions
    helper_script = (RUN_DIR / 'inject_chapters.js').read_text(encoding='utf-8')
    await client.evaluate(helper_script)
    await client.wait_for("Boolean(window.fillChapter)")
    print("inject_chapters.js loaded into page.")

    # Fill Chapter 1
    print("Drafting Chapter 1...")
    ch01_res = await client.evaluate("window.fillChapter('ch01')")
    print("Chapter 1 filled:", ch01_res)
    # Wait for 1.2s debounce autosave + network
    await asyncio.sleep(4)

    # Chapters 2 to 5
    for i in range(2, 6):
        key = f'ch0{i}'
        print(f"\nAdding Chapter {i} ({key})...")
        
        # Current URL before click
        old_url = await client.evaluate("window.location.href")
        
        # Click "+ Thêm chương mới"
        await client.evaluate("window.clickNewChapter()")
        
        # Wait until URL changes to new chapterId or new chapter is selected
        await asyncio.sleep(2.5)
        await client.wait_for("Boolean(document.querySelector('textarea[placeholder*=\"Bắt đầu câu\"]'))")
        
        # Fill chapter
        res = await client.evaluate(f"window.fillChapter('{key}')")
        print(f"{key} filled:", res)
        
        # Wait for autosave debounce + network
        await asyncio.sleep(4)

    print("\nAll 5 chapters drafted and autosaved.")
    await asyncio.sleep(2)

    # Capture final screenshot of Author IDE
    screenshot_path = EVIDENCE_DIR / 's01_author_ide_all_5_chapters.png'
    await client.capture_screenshot(screenshot_path)

    # Check UI state
    ui_summary = await client.evaluate("""
        (() => {
            const urlParams = new URLSearchParams(window.location.search);
            const titleInput = document.querySelector('input[placeholder*="tiêu đề"]');
            const textarea = document.querySelector('textarea[placeholder*="Bắt đầu câu"]');
            return {
                novelId: urlParams.get('novelId'),
                activeChapterId: urlParams.get('chapterId'),
                activeTitle: titleInput ? titleInput.value : null,
                activeWords: textarea ? textarea.value.trim().split(/\\s+/).length : 0
            };
        })()
    """)
    print("UI Summary:", json.dumps(ui_summary, ensure_ascii=False, indent=2))

    await client.close()
    return novel_id

if __name__ == '__main__':
    novel_id = asyncio.run(main())
    print(f"S01 Complete. Active novel ID: {novel_id}")
