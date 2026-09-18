import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, envSchema } from '../src/config/index.js';
import { getDatabase, getDatabaseAdapter } from '../src/db/connection.js';
import { SQLiteAdapter } from '../src/db/adapters/sqlite.adapter.js';
import { PostgresAdapter } from '../src/db/adapters/postgres.adapter.js';
import { runSeed } from '../src/db/seed.js';

describe('Phase 3 - Batch 1: Configuration & Persistence Foundation Tests', () => {
  describe('1. Configuration Layer & Production Secret Validation', () => {
    it('validates default development configuration successfully', () => {
      const devConfig = validateConfig({
        NODE_ENV: 'development'
      });
      assert.equal(devConfig.NODE_ENV, 'development');
      assert.equal(devConfig.DB_CLIENT, 'sqlite');
      assert.equal(devConfig.PORT, 3000);
      assert.equal(devConfig.HOST, '127.0.0.1');
    });

    it('rejects production environment if default dev JWT_SECRET is used', () => {
      assert.throws(
        () => {
          validateConfig({
            NODE_ENV: 'production',
            JWT_SECRET: 'super-secret-municipal-jwt-key-2026-strict-safety',
            WEBHOOK_HMAC_SECRET: 'production-secure-hmac-key-unique-67890',
            DB_CLIENT: 'sqlite'
          });
        },
        (err: Error) => {
          return err.message.includes('[CONFIG_SECURITY_FATAL]') && err.message.includes('JWT_SECRET');
        }
      );
    });

    it('rejects production environment if default dev WEBHOOK_HMAC_SECRET is used', () => {
      assert.throws(
        () => {
          validateConfig({
            NODE_ENV: 'production',
            JWT_SECRET: 'production-secure-jwt-key-unique-12345',
            WEBHOOK_HMAC_SECRET: 'municipal-gateway-hmac-sha256-secret-boundary',
            DB_CLIENT: 'sqlite'
          });
        },
        (err: Error) => {
          return err.message.includes('[CONFIG_SECURITY_FATAL]') && err.message.includes('WEBHOOK_HMAC_SECRET');
        }
      );
    });

    it('rejects production environment when DB_CLIENT is postgres but DATABASE_URL is missing', () => {
      assert.throws(
        () => {
          validateConfig({
            NODE_ENV: 'production',
            JWT_SECRET: 'production-secure-jwt-key-unique-12345',
            WEBHOOK_HMAC_SECRET: 'production-secure-hmac-key-unique-67890',
            DB_CLIENT: 'postgres'
          });
        },
        (err: Error) => {
          return err.message.includes('[CONFIG_FATAL]') && err.message.includes('DATABASE_URL is required');
        }
      );
    });

    it('accepts valid production configuration when required production parameters are supplied', () => {
      const prodConfig = validateConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        HOST: '0.0.0.0',
        DB_CLIENT: 'postgres',
        DATABASE_URL: 'postgresql://municipal_admin:secure_pwd@db.internal:5432/municipal_waste',
        JWT_SECRET: 'high-entropy-production-jwt-secret-key-32chars',
        WEBHOOK_HMAC_SECRET: 'high-entropy-production-hmac-secret-key-32chars',
        CORS_ORIGIN: 'https://operations.municipal.gov.in',
        DB_POOL_MIN: '4',
        DB_POOL_MAX: '20'
      });

      assert.equal(prodConfig.NODE_ENV, 'production');
      assert.equal(prodConfig.PORT, 8080);
      assert.equal(prodConfig.HOST, '0.0.0.0');
      assert.equal(prodConfig.DB_CLIENT, 'postgres');
      assert.equal(prodConfig.DATABASE_URL, 'postgresql://municipal_admin:secure_pwd@db.internal:5432/municipal_waste');
      assert.equal(prodConfig.DB_POOL_MIN, 4);
      assert.equal(prodConfig.DB_POOL_MAX, 20);
    });
  });

  describe('2. Persistence Abstraction & Database Selection', () => {
    it('returns a working SQLiteAdapter when DB_CLIENT is sqlite', () => {
      const adapter = getDatabaseAdapter({ client: 'sqlite', pathOrUrl: ':memory:' });
      assert.equal(adapter.clientType, 'sqlite');
      assert.ok(adapter instanceof SQLiteAdapter);

      // Verify basic statement execution
      adapter.exec('CREATE TABLE test_table (id TEXT PRIMARY KEY, val INTEGER);');
      const insert = adapter.prepare('INSERT INTO test_table (id, val) VALUES (?, ?);');
      const res = insert.run('row-1', 42);
      assert.equal(res.changes, 1);

      const query = adapter.prepare('SELECT * FROM test_table WHERE id = ?;');
      const row = query.get('row-1') as { id: string; val: number };
      assert.equal(row.id, 'row-1');
      assert.equal(row.val, 42);
    });

    it('returns a configured PostgresAdapter when DB_CLIENT is postgres', () => {
      const adapter = getDatabaseAdapter({
        client: 'postgres',
        pathOrUrl: 'postgresql://pg_user:secret_pass@127.0.0.1:5432/waste_prod'
      });
      assert.equal(adapter.clientType, 'postgres');
      assert.ok(adapter instanceof PostgresAdapter);

      const poolConfig = (adapter as PostgresAdapter).getPoolConfig();
      assert.equal(poolConfig.minPool, 2);
      assert.equal(poolConfig.maxPool, 10);
      assert.ok(!poolConfig.connectionString.includes('secret_pass'), 'Password must be sanitized');
      assert.equal(poolConfig.isConnected, false);
    });

    it('normalizes parameterized query placeholders from ? to $1, $2 for PostgreSQL', () => {
      const pgAdapter = new PostgresAdapter({
        connectionString: 'postgresql://localhost:5432/test'
      });

      const inputSql = 'SELECT * FROM users WHERE username = ? AND is_active = ? AND role = ?';
      const expectedSql = 'SELECT * FROM users WHERE username = $1 AND is_active = $2 AND role = $3';
      assert.equal(pgAdapter.normalizeSql(inputSql), expectedSql);
    });

    it('handles offline PostgreSQL failure deterministically without throwing uncaught exceptions', async () => {
      const pgAdapter = new PostgresAdapter({
        connectionString: 'postgresql://localhost:5432/test'
      });

      await assert.rejects(
        async () => {
          await pgAdapter.query('SELECT 1');
        },
        (err: Error) => {
          return err.message.includes('[POSTGRES_UNAVAILABLE]');
        }
      );
    });
  });

  describe('3. Transaction Abstraction & Atomicity', () => {
    it('executes atomic transactions with commit and rollback support on SQLiteAdapter', async () => {
      const adapter = new SQLiteAdapter(getDatabase(':memory:'));
      adapter.exec('CREATE TABLE tx_test (id TEXT PRIMARY KEY, amount INTEGER);');

      // Successful transaction
      await adapter.transaction(async (tx) => {
        tx.prepare('INSERT INTO tx_test (id, amount) VALUES (?, ?);').run('tx-1', 100);
        tx.prepare('INSERT INTO tx_test (id, amount) VALUES (?, ?);').run('tx-2', 200);
      });

      const countRow = adapter.prepare('SELECT COUNT(*) as c FROM tx_test;').get() as { c: number };
      assert.equal(countRow.c, 2);

      // Failed transaction rollback
      await assert.rejects(
        async () => {
          await adapter.transaction(async (tx) => {
            tx.prepare('INSERT INTO tx_test (id, amount) VALUES (?, ?);').run('tx-3', 300);
            throw new Error('Simulated operational failure during transaction');
          });
        },
        (err: Error) => err.message.includes('Simulated operational failure')
      );

      // Verify tx-3 was rolled back cleanly
      const tx3Row = adapter.prepare('SELECT * FROM tx_test WHERE id = ?;').get('tx-3');
      assert.equal(tx3Row, undefined);

      const finalCount = adapter.prepare('SELECT COUNT(*) as c FROM tx_test;').get() as { c: number };
      assert.equal(finalCount.c, 2);
    });
  });

  describe('4. Production Seeding Guard & Provenance Protection', () => {
    it('refuses to execute synthetic demo seeder in production environment without explicit override', () => {
      const prevEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        assert.throws(
          () => {
            runSeed(getDatabase(':memory:'));
          },
          (err: Error) => {
            return err.message.includes('[PRODUCTION_DATA_PROTECTION_GUARD]') &&
                   err.message.includes('strictly prohibited in production');
          }
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('allows demo seeding in production only when explicit safety override is passed', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevOverride = process.env.ALLOW_DEMO_SEEDING_IN_PRODUCTION;
      try {
        process.env.NODE_ENV = 'production';
        process.env.ALLOW_DEMO_SEEDING_IN_PRODUCTION = 'true';

        const result = runSeed(getDatabase(':memory:'));
        assert.ok(result.sourceId);
        assert.equal(result.wardsCount, 2);
        assert.equal(result.householdsCount, 25);
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.ALLOW_DEMO_SEEDING_IN_PRODUCTION = prevOverride;
      }
    });
  });
});
