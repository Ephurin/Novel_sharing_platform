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
REG06_DIR = EVIDENCE_DIR / 'memory' / 'REG-06'
REG06_DIR.mkdir(parents=True, exist_ok=True)

NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'
CH06_ID = '39174dd3-75c9-44ff-a42d-c43820070b79'

APPEND_TEXT = " Mai Linh mỉm cười gật đầu rồi nhận gói cơm."

def get_outbox():
    cmd = [
        'docker', 'exec', 'ephurin-ui-retest-postgres-1',
        'psql', '-U', 'postgres', '-d', 'ephurin', '-X', '-Atc',
        f"SELECT event_id, revision_id, status, retry_count, last_error FROM analysis_outbox WHERE novel_id='{NOVEL_ID}' AND chapter_id='{CH06_ID}' ORDER BY created_at DESC LIMIT 5;"
    ]
    out = subprocess.check_output(cmd, text=True)
    return [line.split('|') for line in out.strip().splitlines() if line]

async def run():
    print("--- REG-06 Part 2: Modifying Chapter 6 via UI to trigger re-analysis ---")
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and '18080' in t.get('url', '')]
    if not pages:
        print("ERROR: No IDE tab found")
        return
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
                    raise RuntimeError(f"CDP {method} error: {data['error']}")
                return data.get('result', {})

    # Read current text
    get_text_expr = """(() => {
        const bodyInput = document.querySelector('textarea[placeholder*="Bắt đầu câu"]');
        return bodyInput ? bodyInput.value : null;
    })()"""
    cur_text = (await cdp_call('Runtime.evaluate', {'expression': get_text_expr}))['result']['value']
    print(f"Current text length: {len(cur_text) if cur_text else 0}")
    print("Current preview:", repr(cur_text[:120] if cur_text else ''))

    new_text = cur_text.strip() + APPEND_TEXT

    # Use React prototype setter
    set_text_expr = f"""(() => {{
        const el = document.querySelector('textarea[placeholder*="Bắt đầu câu"]');
        if (!el) return 'textarea not found';
        const proto = window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, {json.dumps(new_text)});
        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
        return {{ len: el.value.length }};
    }})()"""
    res = (await cdp_call('Runtime.evaluate', {'expression': set_text_expr, 'returnByValue': True}))['result']['value']
    print("Set text result:", res)

    print("Waiting 5s for autosave debounce...")
    await asyncio.sleep(5)

    # Screenshot
    shot = await cdp_call('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg06_part2_saved.png').write_bytes(base64.b64decode(shot['data']))
    print("Saved evidence/reg06_part2_saved.png")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(run())
