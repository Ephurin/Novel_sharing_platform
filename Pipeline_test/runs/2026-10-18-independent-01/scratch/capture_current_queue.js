const http = require('http');
const fs = require('fs');
const path = require('path');

async function getWsUrl() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const tabs = JSON.parse(data);
        const ideTab = tabs.find(t => t.url && t.url.includes('18080/author/ide'));
        if (!ideTab) reject(new Error('IDE tab not found'));
        else resolve(ideTab.webSocketDebuggerUrl);
      });
    }).on('error', reject);
  });
}

function sendCdp(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function takeScreenshot(ws, filename) {
  const result = await sendCdp(ws, 'Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(result.data, 'base64');
  const outPath = path.resolve(__dirname, '..', 'evidence', filename);
  fs.writeFileSync(outPath, buffer);
  console.log('Saved screenshot to:', outPath);
  return outPath;
}

async function main() {
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));

  // Ensure Memory drawer is open
  await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const isDrawerOpen = Boolean(document.querySelector('[data-testid=\"memory-drawer\"], .memory-drawer') || document.body.innerText.includes('Hàng đợi duyệt') || document.body.innerText.includes('Bộ nhớ cốt truyện'));
      if (!isDrawerOpen) {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Bộ nhớ truyện'));
        if (btn) btn.click();
      }
    })()`
  });

  await new Promise(r => setTimeout(r, 2000));
  await takeScreenshot(ws, 'queue_26_pending_current_state.png');

  const queueText = await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const text = document.body.innerText;
      const proposalsHeader = text.match(/Hàng đợi duyệt[^\\n]*/)?.[0] || '';
      const pendingItems = Array.from(document.querySelectorAll('div, li, tr')).filter(el => el.innerText && el.innerText.includes('Đề xuất') && el.innerText.length < 200).map(el => el.innerText.trim());
      return { proposalsHeader, sampleCount: pendingItems.length };
    })()`,
    returnByValue: true
  });
  console.log('Queue text on UI:', queueText.result.value);

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
