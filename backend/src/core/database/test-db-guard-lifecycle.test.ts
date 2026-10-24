import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import type { Db } from 'mongodb';
import { TestFixtureLifecycle, GuardedDatabaseAdapter } from '../../modules/novels/test-fixture-lifecycle.js';

interface MockDatabaseHarness {
  pool: Pool;
  mongoDb: Db;
  queries: Array<{ text: string; params?: any[] }>;
  mutationCalls: number;
  mongoCalls: Array<{ method: string; collection: string }>;
}

function createMockDatabaseHarness(options: {
  pgDbName?: string;
  mongoDbName?: string;
  queryError?: Error;
}): MockDatabaseHarness {
  const queries: Array<{ text: string; params?: any[] }> = [];
  const mongoCalls: Array<{ method: string; collection: string }> = [];
  let mutationCalls = 0;

  const isMutating = (sql: string) => /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(sql);

  const pool = {
    query: async (text: string, params?: any[]) => {
      queries.push({ text, params });
      if (options.queryError) {
        throw options.queryError;
      }
      if (isMutating(text)) {
        mutationCalls++;
      }
      if (text.includes('SELECT current_database()')) {
        return {
          rowCount: 1,
          rows: [
            {
              current_db: options.pgDbName ?? 'ephurin_test_integration',
              server_addr: '127.0.0.1',
              server_port: 5432,
            },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  } as unknown as Pool;

  const mongoDb = {
    databaseName: options.mongoDbName ?? 'ephurin_test_integration',
    collection: (collName: string) => ({
      insertOne: async () => {
        mutationCalls++;
        mongoCalls.push({ method: 'insertOne', collection: collName });
        return { acknowledged: true };
      },
      deleteMany: async () => {
        mutationCalls++;
        mongoCalls.push({ method: 'deleteMany', collection: collName });
        return { acknowledged: true, deletedCount: 0 };
      },
      countDocuments: async () => 0,
    }),
  } as unknown as Db;

  return {
    pool,
    mongoDb,
    queries,
    get mutationCalls() {
      return mutationCalls;
    },
    mongoCalls,
  };
}

describe('F-06 Regression: Fail-Closed Teardown Mutation Guard', () => {
  const originalOptIn = process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS;

  test('F-06.1: Missing opt-in rejects guard and executes ZERO teardown mutations', async () => {
    delete process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS;

    const harness = createMockDatabaseHarness({
      pgDbName: 'ephurin_test_isolation',
      mongoDbName: 'ephurin_test_isolation',
    });
    const lifecycle = new TestFixtureLifecycle();
    const adapter = new GuardedDatabaseAdapter(lifecycle, harness.pool, harness.mongoDb);

    let guardError: Error | null = null;
    try {
      await lifecycle.authorize(harness.pool, harness.mongoDb);
    } catch (err: any) {
      guardError = err;
    }

    // Verify rejection
    assert.ok(guardError, 'Guard should have thrown for missing opt-in');
    assert.match(guardError.message, /missing required external opt-in/i);
    assert.equal(lifecycle.isAuthorized, false);
    assert.equal(lifecycle.stage, 'UNAUTHORIZED');

    // Node test runner runs after() unconditionally: teardown must be fail-closed
    const cleanupResult = await lifecycle.cleanup(harness.pool, harness.mongoDb);

    // Assert zero mutations
    assert.equal(cleanupResult.cleaned, false);
    assert.equal(cleanupResult.mutationsAttempted, 0);
    assert.equal(cleanupResult.errors.length, 0);
    assert.equal(harness.mutationCalls, 0, 'Database received mutation calls after guard rejection');
    assert.equal(adapter.mutationCallsAfterRejection, 0);

    // Verify attempted mutation via lifecycle throws and does not mutate
    assert.throws(
      () => lifecycle.registerUser('b4260f78-3626-4447-9759-866ceea684d0'),
      /Cannot perform registerUser: database mutation authorization was rejected/
    );
    assert.equal(harness.mutationCalls, 0);
  });

  test('F-06.2: Forbidden PostgreSQL database name rejects guard and executes ZERO teardown mutations', async () => {
    process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS = '1';

    for (const forbiddenPg of ['postgres', 'ephurin', 'production', 'ephurin_dev', 'demo']) {
      const harness = createMockDatabaseHarness({
        pgDbName: forbiddenPg,
        mongoDbName: 'ephurin_test_isolation',
      });
      const lifecycle = new TestFixtureLifecycle();

      let guardError: Error | null = null;
      try {
        await lifecycle.authorize(harness.pool, harness.mongoDb);
      } catch (err: any) {
        guardError = err;
      }

      assert.ok(guardError, `Guard should have rejected forbidden DB "${forbiddenPg}"`);
      assert.match(guardError.message, /not an approved isolated test database/i);
      assert.equal(lifecycle.isAuthorized, false);

      const cleanupResult = await lifecycle.cleanup(harness.pool, harness.mongoDb);
      assert.equal(cleanupResult.cleaned, false);
      assert.equal(cleanupResult.mutationsAttempted, 0);
      assert.equal(harness.mutationCalls, 0, `Forbidden PG DB "${forbiddenPg}" received teardown mutation calls`);
    }
  });

  test('F-06.3: Forbidden MongoDB database name rejects guard and executes ZERO teardown mutations', async () => {
    process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS = '1';

    for (const forbiddenMongo of ['admin', 'local', 'config', 'ephurin', 'production']) {
      const harness = createMockDatabaseHarness({
        pgDbName: 'ephurin_test_isolation',
        mongoDbName: forbiddenMongo,
      });
      const lifecycle = new TestFixtureLifecycle();

      let guardError: Error | null = null;
      try {
        await lifecycle.authorize(harness.pool, harness.mongoDb);
      } catch (err: any) {
        guardError = err;
      }

      assert.ok(guardError, `Guard should have rejected forbidden Mongo DB "${forbiddenMongo}"`);
      assert.match(guardError.message, /not an approved isolated test database/i);
      assert.equal(lifecycle.isAuthorized, false);

      const cleanupResult = await lifecycle.cleanup(harness.pool, harness.mongoDb);
      assert.equal(cleanupResult.cleaned, false);
      assert.equal(cleanupResult.mutationsAttempted, 0);
      assert.equal(harness.mutationCalls, 0, `Forbidden Mongo DB "${forbiddenMongo}" received teardown mutation calls`);
    }
  });

  test('F-06.4: Expected DB identity mismatch rejects guard and executes ZERO teardown mutations', async () => {
    process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS = '1';

    const harness = createMockDatabaseHarness({
      pgDbName: 'ephurin_test_actual',
      mongoDbName: 'ephurin_test_actual',
    });
    const lifecycle = new TestFixtureLifecycle();

    let guardError: Error | null = null;
    try {
      await lifecycle.authorize(harness.pool, harness.mongoDb, {
        expectedDbName: 'ephurin_test_expected',
      });
    } catch (err: any) {
      guardError = err;
    }

    assert.ok(guardError, 'Guard should reject database name mismatch');
    assert.match(guardError.message, /does not match expected isolated test DB/i);
    assert.equal(lifecycle.isAuthorized, false);

    const cleanupResult = await lifecycle.cleanup(harness.pool, harness.mongoDb);
    assert.equal(cleanupResult.cleaned, false);
    assert.equal(cleanupResult.mutationsAttempted, 0);
    assert.equal(harness.mutationCalls, 0, 'Mismatched DB received teardown mutation calls');
  });

  test('F-06.5: Guard query/connection failure rejects guard and executes ZERO teardown mutations', async () => {
    process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS = '1';

    const connError = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    const harness = createMockDatabaseHarness({
      queryError: connError,
    });
    const lifecycle = new TestFixtureLifecycle();

    let guardError: Error | null = null;
    try {
      await lifecycle.authorize(harness.pool, harness.mongoDb);
    } catch (err: any) {
      guardError = err;
    }

    assert.ok(guardError, 'Guard should fail on connection error');
    assert.match(guardError.message, /ECONNREFUSED/);
    assert.equal(lifecycle.isAuthorized, false);

    // Ensure teardown on broken connection attempts zero mutations
    const cleanupResult = await lifecycle.cleanup(harness.pool, harness.mongoDb);
    assert.equal(cleanupResult.cleaned, false);
    assert.equal(cleanupResult.mutationsAttempted, 0);
    assert.equal(harness.mutationCalls, 0, 'Connection-failed DB received teardown mutation calls');
  });

  test('F-06.6: Positive authorization enables valid lifecycle progression', async () => {
    process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS = '1';

    const harness = createMockDatabaseHarness({
      pgDbName: 'ephurin_test_integration',
      mongoDbName: 'ephurin_test_integration',
    });
    const lifecycle = new TestFixtureLifecycle();

    await lifecycle.authorize(harness.pool, harness.mongoDb, {
      expectedDbName: 'ephurin_test_integration',
    });

    assert.equal(lifecycle.isAuthorized, true);
    assert.equal(lifecycle.stage, 'AUTHORIZED');

    // Registration succeeds
    const dummyId = 'c7e8e527-3136-419b-a010-062e2d93e83b';
    lifecycle.registerUser(dummyId);
    assert.equal(lifecycle.tracked.pgUsers.has(dummyId), true);
  });

  // Restore env
  test.after(() => {
    if (originalOptIn !== undefined) {
      process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS = originalOptIn;
    } else {
      delete process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS;
    }
  });
});
