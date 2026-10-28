import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { once } from 'node:events';

// Test-local dummy configuration; no production DB or model endpoints.
process.env.DATABASE_URL ||= 'postgres://unused/ax01';
process.env.MONGODB_URI ||= 'mongodb://unused/ax01';
process.env.JWT_ACCESS_SECRET ||= 'ax01-test-secret-access';
process.env.JWT_REFRESH_SECRET ||= 'ax01-test-secret-refresh';
const { aiGatewayRoutes } = await import('./ai-gateway.routes.js');
const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
const { env } = await import('../../core/config/env.js');

test('AX01 mounted Gateway: active owner scope, trusted actor, idempotency and upstream 409', async () => {
  const novel = '10000000-0000-0000-0000-000000000001';
  const entity = '20000000-0000-0000-0000-000000000001';
  const pool = getPostgresPool();
  const originalQuery = pool.query;
  const originalFetch = globalThis.fetch;
  let calls: any[] = [];
  let upstreamStatus = 200;
  (pool as any).query = async (sql: string, values: string[]) => {
    if (sql.includes('from users')) return { rows: [{ role: values[0] === 'admin' ? 'ADMIN' : values[0] === 'reader' ? 'READER' : 'AUTHOR', status: values[0] === 'inactive' ? 'SUSPENDED' : 'ACTIVE' }] };
    return { rows: values[0] === novel ? [{ novel_id: novel, author_id: 'owner' }] : [] };
  };
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), ...init });
    return new Response(JSON.stringify(upstreamStatus === 200 ? { data: { entity_id: entity, version: 1 } } : { detail: { code: 'CHECKPOINT_CONFLICT' } }), { status: upstreamStatus, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const app = express(); app.use(express.json()); app.use('/api/v1/ai', aiGatewayRoutes);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.httpStatus || 500).json({ code: err.code }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as any;
  const base = `http://127.0.0.1:${address.port}/api/v1/ai/story-brains/${novel}/entities/${entity}/profile`;
  async function request(user: string | null, method='GET', url=base, key: string | null='stable-edit') {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Author-Id': 'spoofed', 'X-Tenant-Id': 'spoofed' };
    if (user) headers.Authorization = 'Bearer ' + jwt.sign({ sub: user, role: user === 'admin' ? 'ADMIN' : user === 'reader' ? 'READER' : 'AUTHOR' }, env.JWT_ACCESS_SECRET);
    if (key) headers['Idempotency-Key'] = key;
    return originalFetch(url, { method, headers, ...(method === 'PATCH' ? { body: JSON.stringify({ expected_version: 0, expected_brain_version: 1, author_notes: 'private' }) } : {}) });
  }
  try {
    for (const [user, status] of [[null, 401], ['inactive', 403], ['reader', 403], ['other', 403]] as const) {
      assert.equal((await request(user, 'PATCH')).status, status);
    }
    assert.equal(calls.length, 0);
    assert.equal((await request('owner', 'GET', base.replace(novel, '10000000-0000-0000-0000-000000000002'))).status, 404);
    assert.equal((await request('owner', 'PATCH', base, null)).status, 422);
    assert.equal(calls.length, 0);
    const saved = await request('owner', 'PATCH');
    assert.equal(saved.status, 200); assert.equal(saved.headers.get('cache-control'), 'no-store');
    assert.equal(calls[0].headers['X-Author-Id'], 'owner');
    assert.equal(calls[0].headers['X-Tenant-Id'], '00000000-0000-0000-0000-000000000001');
    assert.equal(calls[0].headers['Idempotency-Key'], 'stable-edit');
    assert.match(calls[0].url, new RegExp(`/entities/${entity}/profile$`));
    assert.equal((await request('admin')).status, 200); // Preserve inherited ADMIN policy.
    upstreamStatus = 409;
    assert.equal((await request('owner', 'PATCH')).status, 409);
  } finally {
    globalThis.fetch = originalFetch; pool.query = originalQuery;
    server.close(); await once(server, 'close'); await disconnectPostgres();
  }
});
