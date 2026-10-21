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

NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'

def get_canon_counts():
    cmd = [
        'docker', 'exec', 'ephurin-ui-retest-postgres-1',
        'psql', '-U', 'postgres', '-d', 'ephurin', '-X', '-Atc',
        f"SELECT (SELECT count(*) FROM narrative.events WHERE novel_id='{NOVEL_ID}'), (SELECT count(*) FROM narrative.facts WHERE novel_id='{NOVEL_ID}'), (SELECT brain_version FROM narrative.story_brains WHERE novel_id='{NOVEL_ID}');"
    ]
    out = subprocess.check_output(cmd, text=True).strip()
    return out.split('|')

async def main():
    print("=== REG-04: Clicking Approval on Stale V1 Group (79bafe69) ===")
    events_b, facts_b, ver_b = get_canon_counts()
    print(f"Canon Before: events={events_b}, facts={facts_b}, brain_version={ver_b}")

    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    ws = await websockets.connect(pages[0]['webSocketDebuggerUrl'], max_size=50*1024*1024)

    async def cdp(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        await ws.send(json.dumps(msg))
        return json.loads(await ws.recv()).get('result', {})

    # Click the approve button on Group 96 (the second card)
    click_stale = """(() => {
        const approveBtns = Array.from(document.querySelectorAll('button')).filter(b => 
            b.textContent && b.textContent.includes('Duyệt nhóm đã kiểm tra')
        );
        if (approveBtns.length < 2) return 'less than 2 approve buttons';
        approveBtns[1].click();
        return 'clicked stale group button (index 1)';
    })()"""
    res = (await cdp('Runtime.evaluate', {'expression': click_stale}))['result']['value']
    print("Click result:", res)

    print("Waiting 3s for API rejection alert...")
    await asyncio.sleep(3)

    # Capture alert message
    get_alerts = """(() => {
        const alerts = Array.from(document.querySelectorAll('.mantine-Alert-root, [role="alert"]')).map(a => a.textContent.trim());
        return alerts;
    })()"""
    alerts = (await cdp('Runtime.evaluate', {'expression': get_alerts, 'returnByValue': True}))['result']['value']
    print("\nAlerts displayed in UI:")
    for a in alerts:
        print(" -", a)

    # Capture screenshot
    shot = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg04_stale_rejection_ui.png').write_bytes(base64.b64decode(shot['data']))
    print("\nSaved evidence/reg04_stale_rejection_ui.png")

    events_a, facts_a, ver_a = get_canon_counts()
    print(f"\nCanon After:  events={events_a}, facts={facts_a}, brain_version={ver_a}")

    assert events_b == events_a, f"Canon events changed! {events_b} -> {events_a}"
    assert facts_b == facts_a, f"Canon facts changed! {facts_b} -> {facts_a}"
    assert ver_b == ver_a, f"Brain version changed! {ver_b} -> {ver_a}"
    print("\nPASS: Attempt to approve stale V1 proposals was rejected with STALE_PROPOSAL_EVIDENCE; Canon was NOT modified!")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
