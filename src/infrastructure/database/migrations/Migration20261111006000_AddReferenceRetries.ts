import { Migration } from '@mikro-orm/migrations';

export class Migration20261111006000_AddReferenceRetries extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE wager_transactions
        ADD COLUMN reference_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN next_reference_attempt_at TIMESTAMP;

      ALTER TABLE wager_transactions
        ADD CONSTRAINT wager_transactions_reference_attempts_ck
          CHECK (reference_attempts >= 0);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE wager_transactions
        DROP CONSTRAINT IF EXISTS wager_transactions_reference_attempts_ck,
        DROP COLUMN IF EXISTS next_reference_attempt_at,
        DROP COLUMN IF EXISTS reference_attempts;
    `);
  }
}