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

  console.log('1. Reloading Author IDE page...');
  await sendCdp(ws, 'Page.reload', {});

  console.log('2. Waiting for page to load completely...');
  await new Promise(r => setTimeout(r, 4000));

  await takeScreenshot(ws, 's11_reloaded_and_continue.png');

  const reloadedState = await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const ta = document.querySelector('textarea');
      const text = document.body.innerText;
      const isDraft = text.includes('DRAFT');
      const hasTitle = text.includes('Chương 1 — Bến trở về');
      const wordCount = text.match(/(\\d[\\d,]*)\\s*từ/)?.[1] || '';
      return {
        taFound: Boolean(ta),
        contentLength: ta ? ta.value.length : 0,
        isDraft,
        hasTitle,
        wordCount,
        hasEnding: ta ? ta.value.includes('Tiếng mái tôn rung lên từng hồi nhè nhẹ.') : false
      };
    })()`,
    returnByValue: true
  });
  console.log('Reloaded state:', reloadedState.result.value);

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
