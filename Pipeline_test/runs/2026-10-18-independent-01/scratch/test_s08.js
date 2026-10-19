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

  console.log('1. Checking if Memory Drawer is open...');
  const drawerStatus = await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Bộ nhớ truyện'));
      return { hasBtn: Boolean(btn) };
    })()`,
    returnByValue: true
  });
  console.log('Drawer button:', drawerStatus.result.value);

  // Click memory drawer button
  await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Bộ nhớ truyện'));
      if (btn) btn.click();
    })()`
  });

  await new Promise(r => setTimeout(r, 2000));
  await takeScreenshot(ws, 's08_review_queue_pending.png');

  // Check review queue proposals visible
  const queueInfo = await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const text = document.body.innerText;
      const hasReviewQueue = text.includes('Hàng đợi duyệt') || text.includes('Đề xuất trích xuất') || text.includes('Duyệt nhóm');
      const approveBtns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('Duyệt nhóm') || b.innerText.includes('Chấp nhận'));
      return {
        hasReviewQueue,
        approveButtonsCount: approveBtns.length,
        buttonTexts: approveBtns.map(b => b.innerText.trim())
      };
    })()`,
    returnByValue: true
  });
  console.log('Review queue info on UI:', queueInfo.result.value);

  if (queueInfo.result.value.approveButtonsCount > 0) {
    console.log('2. Clicking first approve group button on UI...');
    await sendCdp(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Duyệt nhóm'));
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 3000));
    await takeScreenshot(ws, 's08_proposals_approved.png');
  }

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
