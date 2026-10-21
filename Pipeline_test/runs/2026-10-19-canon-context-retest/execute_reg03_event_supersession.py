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
    print("=== REG-03: Live UI Event Supersession Execution ===")
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

    # 1. Update Event 1 textarea and click update button
    print("1. Updating Event 1 in History tab...")
    update_expr = f"""(() => {{
        const panel = document.querySelector('[role="tabpanel"][id*="panel-history"]');
        if (!panel) return {{ error: 'history panel not found' }};
        const cards = Array.from(panel.querySelectorAll('.mantine-Card-root'));
        if (!cards.length) return {{ error: 'no event cards found' }};
        const card1 = cards[0];
        const ta = card1.querySelector('textarea');
        if (!ta) return {{ error: 'textarea not found' }};
        
        const proto = window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(ta, {json.dumps(UPDATED_EVENT_TEXT)});
        ta.dispatchEvent(new Event('input', {{ bubbles: true }}));
        ta.dispatchEvent(new Event('change', {{ bubbles: true }}));
        
        const btn = card1.querySelector('button');
        if (!btn) return {{ error: 'update button not found' }};
        if (btn.disabled) return {{ error: 'update button is disabled', text: ta.value }};
        
        btn.click();
        return {{ success: true, newText: ta.value }};
    }})()"""
    res1 = (await cdp('Runtime.evaluate', {'expression': update_expr, 'returnByValue': True}))['result']['value']
    print("Update result:", res1)
    await asyncio.sleep(3)

    # 2. Click "Chờ duyệt" tab
    print("2. Clicking 'Chờ duyệt' tab...")
    click_review = """(() => {
        const tab = Array.from(document.querySelectorAll('.mantine-Tabs-tab')).find(t => 
            t.textContent.includes('Chờ duyệt') || t.getAttribute('value') === 'review'
        );
        if (tab) {
            tab.click();
            return 'clicked review tab';
        }
        return 'review tab not found';
    })()"""
    print((await cdp('Runtime.evaluate', {'expression': click_review}))['result']['value'])
    await asyncio.sleep(2)

    # 3. Check review queue in UI
    check_review = """(() => {
        const alerts = Array.from(document.querySelectorAll('.mantine-Alert-root, [role="alert"]')).map(a => a.textContent.trim());
        const cards = Array.from(document.querySelectorAll('.mantine-Card-root')).map(c => c.innerText.slice(0, 150));
        return { alerts, cards };
    })()"""
    rev_info = (await cdp('Runtime.evaluate', {'expression': check_review, 'returnByValue': True}))['result']['value']
    print("Review queue after correction proposal:", json.dumps(rev_info, indent=2, ensure_ascii=False))

    # Capture screenshot of proposal with supersedes notice
    shot1 = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg03_proposal_supersedes_ui.png').write_bytes(base64.b64decode(shot1['data']))
    print("Saved evidence/reg03_proposal_supersedes_ui.png")

    # 4. Click "Duyệt nhóm đã kiểm tra"
    print("3. Clicking 'Duyệt nhóm đã kiểm tra'...")
    click_approve = """(() => {
        const btns = Array.from(document.querySelectorAll('button')).filter(b => 
            b.textContent && b.textContent.includes('Duyệt nhóm đã kiểm tra') && !b.disabled
        );
        if (!btns.length) return 'no enabled approve button found';
        btns[0].click();
        return 'clicked approve button';
    })()"""
    res_appr = (await cdp('Runtime.evaluate', {'expression': click_approve}))['result']['value']
    print("Approve result:", res_appr)
    await asyncio.sleep(3)

    # Capture screenshot after approval
    shot2 = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg03_supersession_approved_ui.png').write_bytes(base64.b64decode(shot2['data']))
    print("Saved evidence/reg03_supersession_approved_ui.png")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(run())
