import asyncio
import json
import urllib.request
import websockets
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

async def main():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json/list').read())
    pages = [t for t in tabs if t.get('type') == 'page' and not t.get('url', '').startswith('chrome://')]
    ws_url = pages[0]['webSocketDebuggerUrl']
    ws = await websockets.connect(ws_url, max_size=100*1024*1024)
    
    async def send(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        await ws.send(json.dumps(msg))
        return json.loads(await ws.recv()).get('result', {})

    # Execute fetch manually in the browser context to see the exact error response from the UI's own session!
    test_eval = await send('Runtime.evaluate', {
        'expression': """(async () => {
            const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Duyệt nhóm đã kiểm tra'));
            // Let's see what groups exist in the review queue via the browser's own fetch
            const res = await fetch('/api/v1/ai/story-brains/735c3109-c0be-4512-96cf-da7382ce8d56/review-queue', {
                headers: { 'Accept': 'application/json' },
                credentials: 'include'
            });
            const data = await res.json();
            return {
                status: res.status,
                queueLength: data.data?.length,
                groups: Array.from(new Set(data.data?.map(p => p.dependency_group_id))),
                firstGroupProposals: data.data?.filter(p => p.dependency_group_id === data.data[0]?.dependency_group_id).map(p => ({
                    id: p.proposal_id,
                    type: p.proposal_type,
                    status: p.status
                }))
            };
        })()""",
        'awaitPromise': True,
        'returnByValue': True
    })
    print("Browser Review Queue Fetch:", json.dumps(test_eval.get('result', {}).get('value'), indent=2, ensure_ascii=False))
    await ws.close()

if __name__ == '__main__':
    asyncio.run(main())
