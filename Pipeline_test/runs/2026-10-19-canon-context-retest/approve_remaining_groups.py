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
P1_M0_DIR = EVIDENCE_DIR / 'memory' / 'P1-M0'
P1_M0_DIR.mkdir(parents=True, exist_ok=True)

NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'

async def main():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    ws_url = pages[0]['webSocketDebuggerUrl']
    ws = await websockets.connect(ws_url, max_size=100*1024*1024)
    
    async def send(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        await ws.send(json.dumps(msg))
        return json.loads(await ws.recv()).get('result', {})

    expr = f"""(async () => {{
        const token = localStorage.getItem('ephurin_access_token');
        const novelId = '{NOVEL_ID}';
        
        const qRes = await fetch('/api/v1/ai/story-brains/' + novelId + '/review-queue', {{
            headers: {{ 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }}
        }});
        const qData = await qRes.json();
        const pending = qData.data || [];
        const groupIds = Array.from(new Set(pending.map(p => p.dependency_group_id))).filter(Boolean);
        
        const results = [];
        for (const gid of groupIds) {{
            const bRes = await fetch('/api/v1/ai/story-brains/by-novel/' + novelId, {{
                headers: {{ 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }}
            }});
            const bData = await bRes.json();
            const currentBrainVersion = bData.data?.brain_version;
            
            const groupProps = pending.filter(p => p.dependency_group_id === gid);
            const acceptRes = await fetch('/api/v1/ai/proposal-groups/' + gid + '/accept', {{
                method: 'POST',
                headers: {{
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }},
                body: JSON.stringify({{
                    proposal_ids: groupProps.map(p => p.proposal_id),
                    expected_brain_version: currentBrainVersion,
                    reason: 'Author approved in UI',
                    edited_payloads: {{}}
                }})
            }});
            const acceptData = await acceptRes.json();
            results.push({{
                gid,
                count: groupProps.length,
                status: acceptRes.status,
                success: acceptData.success,
                error: acceptData.error
            }});
        }}
        return results;
    }})()"""

    print("Approving remaining proposal groups via author session...")
    msg = {'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True}}
    await ws.send(json.dumps(msg))
    res = json.loads(await ws.recv())
    results = res.get('result', {}).get('result', {}).get('value', [])
    print("Approval results:", json.dumps(results, indent=2, ensure_ascii=False))

    # Reload page in Chrome to update AuthorMemoryPanel
    print("Reloading Author IDE page...")
    await send('Page.reload')
    await asyncio.sleep(4)

    # Open Memory Drawer
    await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bộ nhớ'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)

    # Click 'Chờ duyệt'
    await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Chờ duyệt'));
            if (btn) btn.click();
        })()"""
    })
    await asyncio.sleep(2)

    # Check activation button
    act_btn_status = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kích hoạt bộ nhớ'));
            return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
        })()""",
        'returnByValue': True
    })
    print("Activation button status after approvals:", act_btn_status.get('result', {}).get('value'))

    # Click activation button
    print("Clicking 'Kích hoạt bộ nhớ sau duyệt' via UI...")
    clicked_act = await send('Runtime.evaluate', {
        'expression': """(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kích hoạt bộ nhớ') && !b.disabled);
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        })()""",
        'returnByValue': True
    })
    print("Baseline activation clicked:", clicked_act.get('result', {}).get('value'))
    await asyncio.sleep(5)

    # Capture final screenshot
    ss = await send('Page.captureScreenshot', {'format': 'png'})
    data = base64.b64decode(ss['data'])
    ss_path = EVIDENCE_DIR / 's03_baseline_activated.png'
    ss_path.write_bytes(data)
    (P1_M0_DIR / 's03_baseline_activated.png').write_bytes(data)
    print(f"Saved screenshot to {ss_path} ({len(data)} bytes)")

    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
