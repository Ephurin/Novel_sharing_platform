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

def get_canon_counts():
    cmd = [
        'docker', 'exec', 'ephurin-ui-retest-postgres-1',
        'psql', '-U', 'postgres', '-d', 'ephurin', '-X', '-Atc',
        f"SELECT (SELECT count(*) FROM narrative.events WHERE novel_id='{NOVEL_ID}'), (SELECT count(*) FROM narrative.facts WHERE novel_id='{NOVEL_ID}'), (SELECT brain_version FROM narrative.story_brains WHERE novel_id='{NOVEL_ID}');"
    ]
    out = subprocess.check_output(cmd, text=True).strip()
    return out.split('|')

async def run():
    print("=== Testing REG-04: Approving Stale V1 Group via UI ===")
    events_b, facts_b, ver_b = get_canon_counts()
    print(f"Canon Before: events={events_b}, facts={facts_b}, brain_version={ver_b}")

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

    # Ensure Memory drawer is open and Review tab is selected
    await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Bộ nhớ'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)

    await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Chờ duyệt'));
            if (tab) tab.click();
        })()"""
    })
    await asyncio.sleep(2)

    # Find the cards in the review panel
    # We want to click "Duyệt nhóm đã kiểm tra" on the FIRST card (which corresponds to Group 1 / V1)
    click_first_group = """(() => {
        const approveBtns = Array.from(document.querySelectorAll('button')).filter(b => 
            b.textContent && b.textContent.includes('Duyệt nhóm đã kiểm tra')
        );
        if (!approveBtns.length) return 'no approve button found';
        approveBtns[0].click();
        return `clicked first approve button out of ${approveBtns.length}`;
    })()"""
    res = (await cdp('Runtime.evaluate', {'expression': click_first_group}))['result']['value']
    print("Approval button click result:", res)

    print("Waiting 3s for API response and alert...")
    await asyncio.sleep(3)

    # Capture alert message
    get_alerts = """(() => {
        const alerts = Array.from(document.querySelectorAll('.mantine-Alert-root, [role="alert"]')).map(a => a.textContent.trim());
        return alerts;
    })()"""
    alerts = (await cdp('Runtime.evaluate', {'expression': get_alerts, 'returnByValue': True}))['result']['value']
    print("Alerts displayed in UI:", alerts)

    # Capture screenshot
    shot = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg04_stale_rejection_ui.png').write_bytes(base64.b64decode(shot['data']))
    print("Saved evidence/reg04_stale_rejection_ui.png")

    events_a, facts_a, ver_a = get_canon_counts()
    print(f"Canon After:  events={events_a}, facts={facts_a}, brain_version={ver_a}")

    assert events_b == events_a, f"Canon events changed! {events_b} -> {events_a}"
    assert facts_b == facts_a, f"Canon facts changed! {facts_b} -> {facts_a}"
    assert ver_b == ver_a, f"Brain version changed! {ver_b} -> {ver_a}"
    print("PASS: Canon was NOT modified when attempting to approve stale V1 proposals!")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(run())
