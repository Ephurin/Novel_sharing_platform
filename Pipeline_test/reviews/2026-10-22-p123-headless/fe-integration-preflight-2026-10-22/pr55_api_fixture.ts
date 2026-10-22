import { writeFileSync } from 'node:fs';
(async () => {
  const { createApp } = await import('file:///C:/tmp/novel-fe-pr55-preflight-20261022/backend/src/app.ts');
  const { connectMongo } = await import('file:///C:/tmp/novel-fe-pr55-preflight-20261022/backend/src/core/database/mongo.ts');
  await connectMongo();
  const server = createApp().listen(0, '127.0.0.1', () => {
    writeFileSync(process.env.ASTRA_READY_FILE!, JSON.stringify({ port: (server.address() as { port: number }).port }));
  });
})().catch(error => { console.error(error); process.exit(1); });
