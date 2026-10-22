import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import { aiGatewayService } from './ai-gateway.service.js';
import { getJobStatusController, resumeJobController } from './ai-gateway.controller.js';

const novelId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';

test('job authorization: trusted scope gates both status and mutable resume', async (t) => {
  const pool = getPostgresPool();
  const originalQuery = pool.query;
  const originalForward = aiGatewayService.forwardRequest;
  try {
    for (const controller of [resumeJobController, getJobStatusController]) {
      const resume = controller === resumeJobController;
      for (const scenario of [
        { name: 'wrong author', actor: 'B', scope: { novel_id: novelId }, status: 403 },
        ...[undefined, null, '', 'bad-uuid', 123, [], {}, true, ' ' + novelId].map((scope) =>
          ({ name: `invalid scope ${JSON.stringify(scope)}`, actor: 'A', scope: { novel_id: scope }, status: 403 })),
        { name: 'null metadata', actor: 'A', scope: null, status: 403 },
        { name: 'array metadata', actor: 'A', scope: [{ novel_id: novelId }], status: 403 },
        { name: 'missing job', actor: 'A', scope: {}, status: 404, missing: true },
        { name: 'deleted novel', actor: 'A', scope: { novel_id: novelId }, status: 404, deleted: true },
        { name: 'owner bootstrap', actor: 'A', scope: { novel_id: novelId, type: 'bootstrap' }, status: resume ? 202 : 200 },
        { name: 'owner writing job', actor: 'A', scope: { novel_id: novelId, type: 'writing' }, status: resume ? 202 : 200 },
        { name: 'authorized admin', actor: 'B', role: 'ADMIN', scope: { novel_id: novelId }, status: resume ? 202 : 200 },
      ]) {
        await t.test(`${resume ? 'resume' : 'GET'}: ${scenario.name}`, async () => {
          const calls: { method: string; path: string; userId?: string }[] = [];
          pool.query = (async (_sql: unknown, params: unknown[]) => {
            assert.deepEqual(params, [novelId]);
            return { rows: 'deleted' in scenario ? [] : [{ novel_id: novelId, author_id: 'A' }] };
          }) as typeof pool.query;
          aiGatewayService.forwardRequest = (async (options: typeof calls[number]) => {
            calls.push(options);
            assert.equal(options.userId, scenario.actor);
            if (options.method === 'GET') {
              assert.equal(options.path, `/v1/jobs/${jobId}`);
              if ('missing' in scenario) throw new AppError(404, 'NOT_FOUND', 'Job not found');
              return scenario.scope;
            }
            assert.equal(options.path, `/v1/jobs/${jobId}/resume`);
            return { job_id: jobId, status: 'failed' };
          }) as typeof aiGatewayService.forwardRequest;
          let status = 200;
          let error: unknown;
          let response: unknown;
          const req = { params: { jobId }, auth: { userId: scenario.actor, role: 'role' in scenario ? scenario.role : 'AUTHOR' },
            body: { novel_id: novelId, userId: 'A' }, header: () => 'authz-test' } as unknown as Request;
          const res = { status(code: number) { status = code; return this; }, json(body: unknown) { response = body; return this; } } as unknown as Response;
          const next = ((value: unknown) => { error = value; }) as NextFunction;
          await controller(req, res, next);
          if (scenario.status >= 400) {
            assert.ok(error instanceof AppError);
            assert.equal(error.httpStatus, scenario.status);
            assert.equal(response, undefined);
            assert.deepEqual(calls.map((call) => call.method), ['GET'], 'denial must make zero mutable POST calls');
          } else {
            assert.equal(error, undefined);
            assert.equal(status, scenario.status);
            assert.ok(response);
            assert.deepEqual(calls.map((call) => call.method), resume ? ['GET', 'POST'] : ['GET']);
          }
        });
      }
    }
  } finally {
    pool.query = originalQuery;
    aiGatewayService.forwardRequest = originalForward;
    await disconnectPostgres();
  }
});
