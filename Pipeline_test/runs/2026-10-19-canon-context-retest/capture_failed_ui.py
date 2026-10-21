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

async def main():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    ws = await websockets.connect(pages[0]['webSocketDebuggerUrl'], max_size=50*1024*1024)

    async def cdp(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        await ws.send(json.dumps(msg))
        return json.loads(await ws.recv())

    # Ensure memory drawer is open
    await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Bộ nhớ'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)

    # Click review tab
    await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Chờ duyệt'));
            if (tab) tab.click();
        })()"""
    })
    await asyncio.sleep(2)

    # Capture screenshot
    res = await cdp('Page.captureScreenshot', {'format': 'png'})
    (EVIDENCE_DIR / 'reg06_part2_failed_ui.png').write_bytes(base64.b64decode(res['result']['data']))
    print("Saved evidence/reg06_part2_failed_ui.png")

    # Get alert text
    alert_text = await cdp('Runtime.evaluate', {
        'expression': """(() => {
            const alerts = Array.from(document.querySelectorAll('.mantine-Alert-root, [role="alert"]')).map(a => a.textContent.trim());
            return alerts;
        })()""",
        'returnByValue': True
    })
    print("Alerts on page:", alert_text.get('result', {}).get('result', {}).get('value', []))

    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
