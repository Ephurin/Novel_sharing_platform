import asyncio
import base64
import json
import pathlib
import sys
import urllib.request
import websockets

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
EVIDENCE_DIR = RUN_DIR / 'evidence'

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

    # 1. Click on "Bộ nhớ · Trích xuất" button
    click_drawer = """
    (() => {
        const btn = Array.from(document.querySelectorAll('button, div, span')).find(b => 
            b.textContent && (b.textContent.includes('Bộ nhớ · Trích xuất') || b.textContent.includes('Bộ nhớ truyện'))
        );
        if (btn) {
            btn.click();
            return 'clicked: ' + btn.textContent.trim();
        }
        return 'drawer button not found';
    })()
    """
    res1 = (await cdp_call('Runtime.evaluate', {'expression': click_drawer}))['result']['value']
    print("Drawer open result:", res1)
    await asyncio.sleep(2)

    # 2. Click "Chờ duyệt" button
    click_review = """
    (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Chờ duyệt'));
        if (btn) {
            btn.click();
            return 'clicked review tab: ' + btn.textContent.trim();
        }
        return 'review button not found';
    })()
    """
    res2 = (await cdp_call('Runtime.evaluate', {'expression': click_review}))['result']['value']
    print("Review tab result:", res2)
    await asyncio.sleep(2)

    # 3. Inspect review queue UI details
    ui_details = (await cdp_call('Runtime.evaluate', {
        'expression': """
        (() => {
            const body = document.body.innerText;
            const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean);
            const reviewActions = buttons.filter(b => b.includes('Duyệt') || b.includes('Từ chối') || b.includes('giữ nguyên') || b.includes('canon') || b.includes('Phân tích lại'));
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, span.font-medium, div.font-semibold')).map(el => el.textContent.trim()).filter(Boolean);
            return {
                reviewActions,
                sampleHeadings: headings.slice(0, 20),
                containsReuseLabel: body.includes('Đã có trong canon — giữ nguyên') || body.includes('giữ nguyên') || body.includes('Đã có trong canon'),
                containsReanalyzeBtn: body.includes('Phân tích lại chương đang mở')
            };
        })()
        """,
        'returnByValue': True
    }))['result']['value']

    print("\nUI Details:")
    print("Review Actions:", ui_details.get('reviewActions'))
    print("Sample Headings:", ui_details.get('sampleHeadings'))
    print("Contains Reuse Label:", ui_details.get('containsReuseLabel'))
    print("Contains Reanalyze Button:", ui_details.get('containsReanalyzeBtn'))

    # 4. Take screenshot
    shot = await cdp_call('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg02_review_queue_ui.png').write_bytes(base64.b64decode(shot['data']))
    print("Screenshot saved to evidence/reg02_review_queue_ui.png")

    await ws.close()

asyncio.run(run())
