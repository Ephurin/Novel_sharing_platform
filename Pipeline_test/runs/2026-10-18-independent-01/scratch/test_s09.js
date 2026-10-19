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

  console.log('1. Rapid Edit 1: Appending first quick note...');
  const edit1 = " Trời bắt đầu đổ mưa lâm thâm.";
  await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const ta = document.querySelector('textarea');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, ta.value + ${JSON.stringify(edit1)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    })()`
  });

  // Wait 300ms (shorter than 1200ms debounce), then trigger Rapid Edit 2
  await new Promise(r => setTimeout(r, 300));

  console.log('2. Rapid Edit 2: Appending second quick note immediately before debounce...');
  const edit2 = " Tiếng mái tôn rung lên từng hồi nhè nhẹ.";
  await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const ta = document.querySelector('textarea');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, ta.value + ${JSON.stringify(edit2)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    })()`
  });

  console.log('3. Waiting for debounced autosave and outbox processing...');
  await new Promise(r => setTimeout(r, 4000));

  await takeScreenshot(ws, 's09_rapid_save_result.png');

  const afterState = await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const ta = document.querySelector('textarea');
      const statusText = document.body.innerText.match(/Đang lưu|Đã lưu[^\\n]*/)?.[0] || '';
      return { valLen: ta ? ta.value.length : 0, statusText, endsWith: ta ? ta.value.slice(-60) : '' };
    })()`,
    returnByValue: true
  });
  console.log('After rapid save state:', afterState.result.value);

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
