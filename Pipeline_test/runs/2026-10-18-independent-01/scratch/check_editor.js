const http = require('http');

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

async function main() {
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));

  const res = await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const ta = document.querySelector('textarea');
      return JSON.stringify({
        found: Boolean(ta),
        id: ta ? ta.id : null,
        placeholder: ta ? ta.placeholder : null,
        valueLength: ta ? ta.value.length : 0,
        first100: ta ? ta.value.slice(0, 100) : '',
        last100: ta ? ta.value.slice(-100) : ''
      });
    })()`
  });
  console.log('Textarea info:', JSON.parse(res.result.value));
  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
