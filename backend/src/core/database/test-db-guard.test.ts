import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedTestDbName,
  assertTestDatabaseIsolation
} from './test-db-guard.js';

describe('Test Database Isolation Guard Rules (Negative and Positive Contract)', () => {
  const validTestDb = 'ephurin_report_e2e_a1b2c3d4';

  test('Rule 1: Missing external opt-in (EPHURIN_ALLOW_TEST_DB_MUTATIONS != "1") fails closed', () => {
    assert.throws(
      () => {
        assertTestDatabaseIsolation({
          pgDatabase: validTestDb,
          mongoDatabase: validTestDb,
          allowOptInEnv: undefined
        });
      },
      /missing required external opt-in EPHURIN_ALLOW_TEST_DB_MUTATIONS=1/
    );

    assert.throws(
      () => {
        assertTestDatabaseIsolation({
          pgDatabase: validTestDb,
          mongoDatabase: validTestDb,
          allowOptInEnv: '0'
        });
      },
      /missing required external opt-in EPHURIN_ALLOW_TEST_DB_MUTATIONS=1/
    );
  });

  test('Rule 2: Ambient CI=true does NOT authorize mutations without opt-in', () => {
    assert.throws(
      () => {
        assertTestDatabaseIsolation({
          pgDatabase: validTestDb,
          mongoDatabase: validTestDb,
          allowOptInEnv: undefined,
          ciEnv: 'true'
        });
      },
      /missing required external opt-in EPHURIN_ALLOW_TEST_DB_MUTATIONS=1/
    );
  });

  test('Rule 3: Ambient NODE_ENV=test does NOT authorize mutations without opt-in', () => {
    assert.throws(
      () => {
        assertTestDatabaseIsolation({
          pgDatabase: validTestDb,
          mongoDatabase: validTestDb,
          allowOptInEnv: undefined,
          nodeEnv: 'test'
        });
      },
      /missing required external opt-in EPHURIN_ALLOW_TEST_DB_MUTATIONS=1/
    );
  });

  test('Rule 4: Ambient npm lifecycle script does NOT authorize mutations without opt-in', () => {
    assert.throws(
      () => {
        assertTestDatabaseIsolation({
          pgDatabase: validTestDb,
          mongoDatabase: validTestDb,
          allowOptInEnv: undefined,
          npmLifecycleScript: 'tsx --test'
        });
      },
      /missing required external opt-in EPHURIN_ALLOW_TEST_DB_MUTATIONS=1/
    );
  });

  test('Rule 5: Default PostgreSQL database "ephurin" is REJECTED even with opt-in', () => {
    assert.throws(
      () => {
        assertTestDatabaseIsolation({
          pgDatabase: 'ephurin',
          mongoDatabase: validTestDb,
          allowOptInEnv: '1'
        });
      },
      /PostgreSQL target "ephurin" is not an approved isolated test database/
    );
  });

  test('Rule 6: Production/system PostgreSQL databases (postgres, template0) are REJECTED even with opt-in', () => {
    for (const forbidden of ['postgres', 'template0', 'production', 'demo', 'ephurin_dev']) {
      assert.throws(
        () => {
          assertTestDatabaseIsolation({
            pgDatabase: forbidden,
            mongoDatabase: validTestDb,
            allowOptInEnv: '1'
          });
        },
        new RegExp(`PostgreSQL target "${forbidden}" is not an approved isolated test database`)
      );
    }
  });

  test('Rule 7: Default MongoDB database "ephurin" is REJECTED even with opt-in', () => {
    assert.throws(
      () => {
        assertTestDatabaseIsolation({
          pgDatabase: validTestDb,
          mongoDatabase: 'ephurin',
          allowOptInEnv: '1'
        });
      },
      /MongoDB target "ephurin" is not an approved isolated test database/
    );
  });

  test('Rule 8: System MongoDB databases (admin, config, local) are REJECTED even with opt-in', () => {
    for (const forbidden of ['admin', 'config', 'local', 'production']) {
      assert.throws(
        () => {
          assertTestDatabaseIsolation({
            pgDatabase: validTestDb,
            mongoDatabase: forbidden,
            allowOptInEnv: '1'
          });
        },
        new RegExp(`MongoDB target "${forbidden}" is not an approved isolated test database`)
      );
    }
  });

  test('Rule 9: Expected test DB name mismatch is REJECTED', () => {
    assert.throws(
      () => {
        assertTestDatabaseIsolation({
          pgDatabase: validTestDb,
          mongoDatabase: validTestDb,
          expectedDbName: 'ephurin_report_e2e_other_run',
          allowOptInEnv: '1'
        });
      },
      /does not match expected isolated test DB/
    );

    assert.throws(
      () => {
        assertTestDatabaseIsolation({
          pgDatabase: validTestDb,
          mongoDatabase: 'ephurin_report_e2e_other_run',
          expectedDbName: validTestDb,
          allowOptInEnv: '1'
        });
      },
      /MongoDB database "ephurin_report_e2e_other_run" does not match expected isolated test DB/
    );
  });

  test('Rule 10: Approved isolated test database with opt-in PASSES', () => {
    assert.doesNotThrow(() => {
      assertTestDatabaseIsolation({
        pgDatabase: validTestDb,
        mongoDatabase: validTestDb,
        expectedDbName: validTestDb,
        allowOptInEnv: '1'
      });
    });

    assert.doesNotThrow(() => {
      assertTestDatabaseIsolation({
        pgDatabase: 'ephurin_test_standalone',
        mongoDatabase: 'ephurin_test_standalone',
        allowOptInEnv: '1'
      });
    });
  });

  test('Rule 11: isAllowedTestDbName helper enforces positive pattern and rejects forbidden names', () => {
    assert.equal(isAllowedTestDbName('ephurin'), false);
    assert.equal(isAllowedTestDbName('postgres'), false);
    assert.equal(isAllowedTestDbName('production'), false);
    assert.equal(isAllowedTestDbName('admin'), false);
    assert.equal(isAllowedTestDbName(''), false);
    assert.equal(isAllowedTestDbName('random_name'), false);

    assert.equal(isAllowedTestDbName('ephurin_report_e2e_12345678'), true);
    assert.equal(isAllowedTestDbName('ephurin_wallet_e2e_12345678'), true);
    assert.equal(isAllowedTestDbName('ephurin_test_suite'), true);
    assert.equal(isAllowedTestDbName('my_suite_test'), true);
  });
});
