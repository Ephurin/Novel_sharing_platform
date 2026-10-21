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

async def run():
    print("=== REG-03: Approving Proposals and Activating Probe Baseline ===")
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

    # 1. Click "Chờ duyệt" tab
    print("1. Clicking 'Chờ duyệt' tab...")
    await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Chờ duyệt'));
            if (tab) tab.click();
        })()"""
    })
    await asyncio.sleep(2)

    # 2. Check for unattached facts that would trigger INVALID_PROJECTION
    # In payload of facts, subject_entity_id or subject_name must resolve.
    # Let's inspect proposal review cards
    click_approve = """(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Duyệt nhóm đã kiểm tra'));
        if (btn && !btn.disabled) {
            btn.click();
            return 'clicked approve group';
        }
        return btn ? 'button disabled' : 'button not found';
    })()"""
    res = (await cdp('Runtime.evaluate', {'expression': click_approve}))['result']['value']
    print("Approve group click:", res)
    await asyncio.sleep(3)

    # Check alert
    alerts = (await cdp('Runtime.evaluate', {
        'expression': "Array.from(document.querySelectorAll('.mantine-Alert-root, [role=\"alert\"]')).map(a => a.textContent.trim())",
        'returnByValue': True
    }))['result']['value']
    print("Alerts after group approval:", alerts)

    # 3. Click "Kích hoạt bộ nhớ sau duyệt"
    print("2. Clicking 'Kích hoạt bộ nhớ sau duyệt' button...")
    click_activate = """(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Kích hoạt bộ nhớ sau duyệt'));
        if (btn && !btn.disabled) {
            btn.click();
            return 'clicked activate baseline button';
        }
        return btn ? 'button disabled' : 'activate button not found';
    })()"""
    act_res = (await cdp('Runtime.evaluate', {'expression': click_activate}))['result']['value']
    print("Activate button result:", act_res)
    await asyncio.sleep(3)

    # Capture screenshot
    shot = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg03_probe_baseline_activated.png').write_bytes(base64.b64decode(shot['data']))
    print("Saved evidence/reg03_probe_baseline_activated.png")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(run())
