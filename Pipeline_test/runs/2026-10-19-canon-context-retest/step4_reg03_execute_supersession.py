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

PROBE_NOVEL_ID = '2e0e9175-4093-4462-b37f-59e8ef7a13f1'
UPDATED_EVENT_TEXT = "An ký hợp đồng kiểm định trạm bơm với ông Hòa trong thời hạn mười lăm ngày."

async def run():
    print("=== REG-03: Executing Event Supersession via UI ===")
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

    # 1. Click "Sự kiện" (history) tab
    print("1. Clicking 'Sự kiện' (history) tab...")
    click_history = """(() => {
        const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Sự kiện'));
        if (tab) {
            tab.click();
            return 'clicked history tab';
        }
        return 'history tab not found';
    })()"""
    print((await cdp('Runtime.evaluate', {'expression': click_history}))['result']['value'])
    await asyncio.sleep(2)

    # 2. Find Event 1 card and update textarea
    print("2. Editing Event 1 summary in History tab...")
    edit_event = f"""(() => {{
        const setVal = (el, val) => {{
            const proto = window.HTMLTextAreaElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
        }};
        const textareas = Array.from(document.querySelectorAll('textarea')).filter(t => 
            t.value && t.value.includes('mười hai ngày')
        );
        if (!textareas.length) return 'event textarea not found';
        setVal(textareas[0], {json.dumps(UPDATED_EVENT_TEXT)});
        return 'updated textarea to: ' + textareas[0].value;
    }})()"""
    edit_res = (await cdp('Runtime.evaluate', {'expression': edit_event}))['result']['value']
    print("Edit result:", edit_res)
    await asyncio.sleep(1)

    # Click "Đề xuất cập nhật thế giới" button
    click_update = """(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent && b.textContent.includes('Đề xuất cập nhật thế giới') && !b.disabled
        );
        if (btn) {
            btn.click();
            return 'clicked update world proposal button';
        }
        return 'button not found or disabled';
    })()"""
    upd_res = (await cdp('Runtime.evaluate', {'expression': click_update}))['result']['value']
    print("Update button result:", upd_res)
    await asyncio.sleep(3)

    # Capture screenshot in History tab
    shot1 = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg03_correction_submitted.png').write_bytes(base64.b64decode(shot1['data']))
    print("Saved evidence/reg03_correction_submitted.png")

    # 3. Go to "Chờ duyệt" tab
    print("3. Navigating to 'Chờ duyệt' tab...")
    click_review = """(() => {
        const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Chờ duyệt'));
        if (tab) {
            tab.click();
            return 'clicked review tab';
        }
        return 'review tab not found';
    })()"""
    print((await cdp('Runtime.evaluate', {'expression': click_review}))['result']['value'])
    await asyncio.sleep(2)

    # Check alert on proposal card
    check_proposal = """(() => {
        const alerts = Array.from(document.querySelectorAll('.mantine-Alert-root, [role="alert"]')).map(a => a.textContent.trim());
        const cards = Array.from(document.querySelectorAll('.mantine-Card-root')).map(c => c.innerText.slice(0, 150));
        return { alerts, cards };
    })()"""
    prop_info = (await cdp('Runtime.evaluate', {'expression': check_proposal, 'returnByValue': True}))['result']['value']
    print("Proposal card in review tab:", json.dumps(prop_info, indent=2, ensure_ascii=False))

    # Capture screenshot of review tab showing supersedes alert
    shot2 = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg03_proposal_supersedes_ui.png').write_bytes(base64.b64decode(shot2['data']))
    print("Saved evidence/reg03_proposal_supersedes_ui.png")

    # 4. Click "Duyệt nhóm đã kiểm tra"
    print("4. Approving supersession proposal group...")
    click_approve = """(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent && b.textContent.includes('Duyệt nhóm đã kiểm tra') && !b.disabled
        );
        if (btn) {
            btn.click();
            return 'clicked approve group';
        }
        return 'approve button not found or disabled';
    })()"""
    appr_res = (await cdp('Runtime.evaluate', {'expression': click_approve}))['result']['value']
    print("Approve click:", appr_res)
    await asyncio.sleep(3)

    # Capture screenshot after approval
    shot3 = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg03_supersession_approved_ui.png').write_bytes(base64.b64decode(shot3['data']))
    print("Saved evidence/reg03_supersession_approved_ui.png")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(run())
