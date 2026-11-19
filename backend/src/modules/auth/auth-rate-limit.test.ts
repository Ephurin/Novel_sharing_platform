import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { env } from '../../core/config/env.js';
import { errorMiddleware } from '../../core/middleware/error.middleware.js';
import { authRateLimit } from './auth-rate-limit.js';

function post(port: number, localAddress: string, headers: Record<string, string> = {}) {
  return new Promise<number>((resolve, reject) => {
    const client = request({ host: '127.0.0.1', port, method: 'POST', localAddress, headers }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode!));
    });
    client.once('error', reject).end();
  });
}

test('authentication limits distinguish proxy clients and ignore forged direct headers', async (t) => {
  const originalProxy = env.AUTH_TRUSTED_PROXY_HOST;
  env.AUTH_TRUSTED_PROXY_HOST = '127.0.0.2';
  t.after(() => { env.AUTH_TRUSTED_PROXY_HOST = originalProxy; });

  async function listen(server: Server) {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    return (server.address() as AddressInfo).port;
  }

  const app = express();
  app.post('/', authRateLimit({ scope: 'auth-proxy-test', max: 2, windowMs: 60_000 }), (_request, response) => {
    response.sendStatus(204);
  });
  app.use(errorMiddleware);
  const backendPort = await listen(createServer(app));
  const proxyPort = await listen(createServer(async (incoming, response) => {
    // Match nginx: replace forwarded addresses with the address of the downstream socket.
    const peer = incoming.socket.remoteAddress!;
    response.writeHead(await post(backendPort, '127.0.0.2', { 'X-Real-IP': peer, 'X-Forwarded-For': peer })).end();
  }));

  assert.equal(await post(proxyPort, '127.0.0.3', { 'X-Real-IP': '192.0.2.1' }), 204);
  assert.equal(await post(proxyPort, '127.0.0.3', { 'X-Real-IP': '192.0.2.2' }), 204);
  assert.equal(await post(proxyPort, '127.0.0.3', { 'X-Real-IP': '192.0.2.3' }), 429);
  assert.equal(await post(proxyPort, '127.0.0.4'), 204);

  assert.equal(await post(backendPort, '127.0.0.1', { 'X-Real-IP': '127.0.0.3' }), 204);
  assert.equal(await post(backendPort, '127.0.0.1', { 'X-Real-IP': '192.0.2.4' }), 204);
  assert.equal(await post(backendPort, '127.0.0.1', { 'X-Real-IP': '192.0.2.5', 'X-Forwarded-For': '192.0.2.6' }), 429);
});
