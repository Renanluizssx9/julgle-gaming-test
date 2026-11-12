import { Migration } from '@mikro-orm/migrations';

export class Migration20261111005000_AddWagerReferences extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE wager_transactions
        ADD COLUMN reference_transaction_id UUID,
        ADD COLUMN failure_code VARCHAR(100),
        ADD CONSTRAINT wager_transactions_reference_fk
          FOREIGN KEY (reference_transaction_id) REFERENCES wager_transactions (id);

      CREATE UNIQUE INDEX wager_transactions_one_reversal_per_kind_uq
        ON wager_transactions (reference_transaction_id, kind)
        WHERE reference_transaction_id IS NOT NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP INDEX IF EXISTS wager_transactions_one_reversal_per_kind_uq;
      ALTER TABLE wager_transactions
        DROP CONSTRAINT IF EXISTS wager_transactions_reference_fk,
        DROP COLUMN IF EXISTS failure_code,
        DROP COLUMN IF EXISTS reference_transaction_id;
    `);
  }
}