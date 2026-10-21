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
    print("=== S05 & S06: Consistency Check & Event Suggestion ===")
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

    # Navigate back to main novel (735c3109-c0be-4512-96cf-da7382ce8d56) Chapter 1
    main_url = "http://localhost:18080/author/ide?novelId=735c3109-c0be-4512-96cf-da7382ce8d56&chapterId=51007a3b-a541-4ee8-9d09-619d56553d37"
    print(f"Navigating to Main Novel Chapter 1: {main_url}")
    await cdp('Runtime.evaluate', {'expression': f"window.location.href = '{main_url}'"})
    await asyncio.sleep(4)

    # Open Memory drawer
    await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Bộ nhớ'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)

    # 1. S05: Consistency Check in 'Sự kiện' tab
    print("\n--- S05: Consistency Check ---")
    click_history = """(() => {
        const tab = Array.from(document.querySelectorAll('.mantine-Tabs-tab')).find(t => 
            t.textContent.includes('Sự kiện') || t.getAttribute('value') === 'history'
        );
        if (tab) { tab.click(); return 'clicked history tab'; }
        return 'tab not found';
    })()"""
    print((await cdp('Runtime.evaluate', {'expression': click_history}))['result']['value'])
    await asyncio.sleep(2)

    # Click "Kiểm tra nhất quán chương đang mở"
    click_check = """(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent && b.textContent.includes('Kiểm tra nhất quán chương đang mở') && !b.disabled
        );
        if (btn) { btn.click(); return 'clicked consistency check'; }
        return 'button disabled or not found';
    })()"""
    res_s05 = (await cdp('Runtime.evaluate', {'expression': click_check}))['result']['value']
    print("S05 consistency check click:", res_s05)

    print("Waiting 6s for consistency check result...")
    await asyncio.sleep(6)

    # Capture alert in history tab
    alerts_s05 = (await cdp('Runtime.evaluate', {
        'expression': "Array.from(document.querySelectorAll('.mantine-Alert-root, [role=\"alert\"]')).map(a => a.textContent.trim())",
        'returnByValue': True
    }))['result']['value']
    print("S05 findings:", alerts_s05)

    shot_s05 = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 's05_consistency_check.png').write_bytes(base64.b64decode(shot_s05['data']))
    print("Saved evidence/s05_consistency_check.png")

    # 2. S06: Next Event Suggestion in 'Định hướng' tab
    print("\n--- S06: Next Event Suggestion ---")
    click_plan = """(() => {
        const tab = Array.from(document.querySelectorAll('.mantine-Tabs-tab')).find(t => 
            t.textContent.includes('Định hướng') || t.getAttribute('value') === 'plan'
        );
        if (tab) { tab.click(); return 'clicked plan tab'; }
        return 'plan tab not found';
    })()"""
    print((await cdp('Runtime.evaluate', {'expression': click_plan}))['result']['value'])
    await asyncio.sleep(2)

    # Click "Gợi ý event tiếp theo"
    click_suggest = """(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent && b.textContent.includes('Gợi ý event tiếp theo') && !b.disabled
        );
        if (btn) { btn.click(); return 'clicked suggest events'; }
        return 'button disabled or not found';
    })()"""
    res_s06 = (await cdp('Runtime.evaluate', {'expression': click_suggest}))['result']['value']
    print("S06 suggest events click:", res_s06)

    print("Waiting 10s for LLM event suggestion...")
    await asyncio.sleep(10)

    # Read suggested events
    get_events = """(() => {
        const titles = Array.from(document.querySelectorAll('input[value]')).map(i => i.value).filter(Boolean);
        const alerts = Array.from(document.querySelectorAll('.mantine-Alert-root, [role=\"alert\"]')).map(a => a.textContent.trim());
        const cards = Array.from(document.querySelectorAll('.mantine-Card-root')).map(c => c.innerText.slice(0, 100));
        return { titles, alerts, cards };
    })()"""
    s06_info = (await cdp('Runtime.evaluate', {'expression': get_events, 'returnByValue': True}))['result']['value']
    print("S06 suggested events info:", json.dumps(s06_info, indent=2, ensure_ascii=False))

    shot_s06 = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 's06_event_suggestion.png').write_bytes(base64.b64decode(shot_s06['data']))
    print("Saved evidence/s06_event_suggestion.png")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(run())
