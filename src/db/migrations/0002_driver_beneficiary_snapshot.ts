/**
 * Migration 0002: Driver Beneficiary Snapshot
 *
 * Adds beneficiary_driver_id column to payment_obligations and resident_payments.
 * Ensures the citizen collection fee can be snapshotted to the designated route driver
 * who performs garbage collection, preserving financial auditability against driver reassignments.
 */

import type { Migration } from './types.js';
import type { IDatabaseAdapter } from '../adapters/types.js';

export const migration_0002: Migration = {
  version: '0002',
  name: 'driver_beneficiary_snapshot',

  up: async (adapter: IDatabaseAdapter): Promise<void> => {
    if (adapter.clientType === 'sqlite') {
      // 1. Inspect payment_obligations
      const poInfo = adapter.prepare("PRAGMA table_info(payment_obligations);").all() as Array<{ name: string }>;
      const hasPoDriver = poInfo.some(col => col.name === 'beneficiary_driver_id');
      if (!hasPoDriver) {
        adapter.exec('ALTER TABLE payment_obligations ADD COLUMN beneficiary_driver_id TEXT REFERENCES workers(id);');
      }

      // 2. Inspect resident_payments
      const rpInfo = adapter.prepare("PRAGMA table_info(resident_payments);").all() as Array<{ name: string }>;
      const hasRpDriver = rpInfo.some(col => col.name === 'beneficiary_driver_id');
      if (!hasRpDriver) {
        adapter.exec('ALTER TABLE resident_payments ADD COLUMN beneficiary_driver_id TEXT REFERENCES workers(id);');
      }

      // 3. Create indexes for performance & integrity
      adapter.exec(`
        CREATE INDEX IF NOT EXISTS idx_obligations_driver ON payment_obligations(beneficiary_driver_id);
        CREATE INDEX IF NOT EXISTS idx_payments_driver ON resident_payments(beneficiary_driver_id);
      `);
    } else if (adapter.clientType === 'postgres') {
      await adapter.exec(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'payment_obligations' AND column_name = 'beneficiary_driver_id'
          ) THEN
            ALTER TABLE payment_obligations ADD COLUMN beneficiary_driver_id VARCHAR(64) REFERENCES workers(id);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'resident_payments' AND column_name = 'beneficiary_driver_id'
          ) THEN
            ALTER TABLE resident_payments ADD COLUMN beneficiary_driver_id VARCHAR(64) REFERENCES workers(id);
          END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS idx_obligations_driver ON payment_obligations(beneficiary_driver_id);
        CREATE INDEX IF NOT EXISTS idx_payments_driver ON resident_payments(beneficiary_driver_id);
      `);
    }
  }
};
