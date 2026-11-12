import { Migration } from '@mikro-orm/migrations';

export class Migration20261111002000_AddWagerIdempotency extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE wager_transactions
        ADD COLUMN idempotency_key VARCHAR(512),
        ADD COLUMN payload_hash VARCHAR(64);

      UPDATE wager_transactions
      SET idempotency_key = provider_id || ':' || external_transaction_id;

      ALTER TABLE wager_transactions
        ALTER COLUMN idempotency_key SET NOT NULL;

      CREATE UNIQUE INDEX wager_transactions_idempotency_key_uq
        ON wager_transactions (idempotency_key);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP INDEX IF EXISTS wager_transactions_idempotency_key_uq;
      ALTER TABLE wager_transactions
        DROP COLUMN IF EXISTS payload_hash,
        DROP COLUMN IF EXISTS idempotency_key;
    `);
  }
}