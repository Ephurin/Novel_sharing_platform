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
P1_M0_DIR = EVIDENCE_DIR / 'memory' / 'P1-M0'

async def get_active_page_ws():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
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

    # Find and click "Chờ duyệt" tab in Memory Drawer
    tab_btn = await client.evaluate("""
        (() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Chờ duyệt'));
            if (btn) {
                btn.click();
                return btn.textContent.trim();
            }
            return null;
        })()
    """)
    print("Clicked review tab:", tab_btn)
    await asyncio.sleep(2)

    # Capture screenshot
    ss1 = EVIDENCE_DIR / 's02_raw_proposals_ui.png'
    ss2 = P1_M0_DIR / 's02_raw_proposals_ui.png'
    await client.capture_screenshot(ss1)
    ss2.write_bytes(ss1.read_bytes())

    # Inspect UI elements in review tab
    review_ui_info = await client.evaluate("""
        (() => {
            const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean);
            const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => h.textContent.trim());
            const textSnippets = Array.from(document.querySelectorAll('.font-medium, .font-semibold, [class*="badge"], [class*="card"]'))
                .map(el => el.textContent.trim()).filter(Boolean).slice(0, 30);
            return { buttons: buttons.slice(0, 30), headers, textSnippets };
        })()
    """)
    print("Review UI info:", json.dumps(review_ui_info, indent=2, ensure_ascii=False))

    await client.close()

if __name__ == '__main__':
    asyncio.run(main())
