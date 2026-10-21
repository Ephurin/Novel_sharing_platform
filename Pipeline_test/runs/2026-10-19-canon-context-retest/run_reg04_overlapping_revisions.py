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
REG04_DIR = EVIDENCE_DIR / 'memory' / 'REG-04'
REG04_DIR.mkdir(parents=True, exist_ok=True)

NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'

CH07_TITLE = "Chương 7 — Khảo sát lòng kênh"
CH07_BODY_V1 = "Buổi trưa, An chèo thuyền nan dọc bờ kênh xáng để kiểm tra cọc mốc đo lưu lượng nước. Mặt trời đứng bóng khiến hơi ẩm từ bùn bốc lên nồng nặc."
CH07_BODY_V2_APPEND = " Phía xa, tiếng máy nổ của chiếc xà lan chở cát vọng lại từng hồi đứt quãng."

def get_db_revisions():
    cmd = [
        'docker', 'exec', 'ephurin-ui-retest-postgres-1',
        'psql', '-U', 'postgres', '-d', 'ephurin', '-X', '-Atc',
        f"SELECT r.chapter_id, r.revision_id, r.parent_revision_id, r.word_count, length(r.content), r.created_at FROM chapter_revisions r JOIN chapters c ON c.chapter_id = r.chapter_id WHERE r.novel_id='{NOVEL_ID}' AND c.chapter_number=7 ORDER BY r.created_at ASC;"
    ]
    try:
        out = subprocess.check_output(cmd, text=True)
        return [l.split('|') for l in out.strip().splitlines() if l]
    except Exception as e:
        return []

def get_db_outbox():
    cmd = [
        'docker', 'exec', 'ephurin-ui-retest-postgres-1',
        'psql', '-U', 'postgres', '-d', 'ephurin', '-X', '-Atc',
        f"SELECT event_id, revision_id, status, retry_count, last_error, created_at FROM revision_outbox_events WHERE novel_id='{NOVEL_ID}' ORDER BY created_at DESC LIMIT 5;"
    ]
    try:
        out = subprocess.check_output(cmd, text=True)
        return [l.split('|') for l in out.strip().splitlines() if l]
    except Exception as e:
        return []

async def run():
    print("=== REG-04: Overlapping Revisions & Stale Handling ===")
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

    # 1. Click "+ Thêm chương mới"
    print("1. Creating Chapter 7 via UI...")
    click_new = """(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Thêm chương mới'));
        if (btn) {
            btn.click();
            return 'clicked';
        }
        return 'not found';
    })()"""
    res1 = (await cdp('Runtime.evaluate', {'expression': click_new}))['result']['value']
    print("Click new chapter:", res1)
    await asyncio.sleep(2)

    # 2. Fill Title and Body V1
    print("2. Entering V1 content...")
    fill_v1 = f"""(() => {{
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
        setVal(titleInput, {json.dumps(CH07_TITLE)});
        setVal(bodyInput, {json.dumps(CH07_BODY_V1)});
        return {{ title: titleInput.value, len: bodyInput.value.length }};
    }})()"""
    res2 = (await cdp('Runtime.evaluate', {'expression': fill_v1, 'returnByValue': True}))['result']['value']
    print("V1 entered:", res2)

    # Wait 1.5s for autosave of V1 to trigger and commit
    print("Waiting 1.5s for V1 autosave to trigger...")
    await asyncio.sleep(1.5)

    # 3. Immediately enter Body V2 (overlap before V1 extraction completes)
    print("3. Entering V2 content immediately to create revision overlap...")
    fill_v2 = f"""(() => {{
        const setVal = (el, val) => {{
            const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
        }};
        const bodyInput = document.querySelector('textarea[placeholder*="Bắt đầu câu"]');
        if (!bodyInput) return {{ error: 'textarea not found' }};
        const newText = bodyInput.value.trim() + {json.dumps(CH07_BODY_V2_APPEND)};
        setVal(bodyInput, newText);
        return {{ len: bodyInput.value.length }};
    }})()"""
    res3 = (await cdp('Runtime.evaluate', {'expression': fill_v2, 'returnByValue': True}))['result']['value']
    print("V2 entered:", res3)

    print("Waiting 4s for V2 autosave...")
    await asyncio.sleep(4)

    # Check revisions in DB
    revs = get_db_revisions()
    print(f"Chapter 7 revisions in DB: count = {len(revs)}")
    for r in revs:
        print("  Revision:", r)

    outbox = get_db_outbox()
    print("Recent Outbox Events:")
    for o in outbox:
        print("  Outbox:", o)

    # Capture screenshot
    shot = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg04_revisions_created.png').write_bytes(base64.b64decode(shot['data']))
    print("Saved evidence/reg04_revisions_created.png")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(run())
