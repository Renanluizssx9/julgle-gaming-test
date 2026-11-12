import { Migration } from '@mikro-orm/migrations';

export class Migration20261111003000_AddFinancialConstraints extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE wallets
        ADD CONSTRAINT wallets_balance_nonnegative_ck CHECK (balance >= 0),
        ADD CONSTRAINT wallets_version_positive_ck CHECK (version >= 1);

      ALTER TABLE wager_transactions
        ADD CONSTRAINT wager_transactions_amount_positive_ck CHECK (amount > 0);

      ALTER TABLE wallet_ledger_entries
        ADD CONSTRAINT wallet_ledger_entries_amount_positive_ck CHECK (amount > 0),
        ADD CONSTRAINT wallet_ledger_entries_direction_ck
          CHECK (direction IN ('DEBIT', 'CREDIT')),
        ADD CONSTRAINT wallet_ledger_entries_balanced_ck CHECK (
          (direction = 'DEBIT' AND balance_before - amount = balance_after)
          OR
          (direction = 'CREDIT' AND balance_before + amount = balance_after)
        ),
        ADD CONSTRAINT wallet_ledger_entries_transaction_uq UNIQUE (transaction_id),
        ADD CONSTRAINT wallet_ledger_entries_wallet_fk
          FOREIGN KEY (wallet_id) REFERENCES wallets (id),
        ADD CONSTRAINT wallet_ledger_entries_transaction_fk
          FOREIGN KEY (transaction_id) REFERENCES wager_transactions (id);

      CREATE FUNCTION reject_wallet_ledger_mutation() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_ledger_entries are immutable';
      END;
      $$;

      CREATE TRIGGER wallet_ledger_immutable_trg
        BEFORE UPDATE OR DELETE ON wallet_ledger_entries
        FOR EACH ROW EXECUTE FUNCTION reject_wallet_ledger_mutation();
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP TRIGGER IF EXISTS wallet_ledger_immutable_trg ON wallet_ledger_entries;
      DROP FUNCTION IF EXISTS reject_wallet_ledger_mutation();

      ALTER TABLE wallet_ledger_entries
        DROP CONSTRAINT IF EXISTS wallet_ledger_entries_transaction_fk,
        DROP CONSTRAINT IF EXISTS wallet_ledger_entries_wallet_fk,
        DROP CONSTRAINT IF EXISTS wallet_ledger_entries_transaction_uq,
        DROP CONSTRAINT IF EXISTS wallet_ledger_entries_balanced_ck,
        DROP CONSTRAINT IF EXISTS wallet_ledger_entries_direction_ck,
        DROP CONSTRAINT IF EXISTS wallet_ledger_entries_amount_positive_ck;

      ALTER TABLE wager_transactions
        DROP CONSTRAINT IF EXISTS wager_transactions_amount_positive_ck;

      ALTER TABLE wallets
        DROP CONSTRAINT IF EXISTS wallets_version_positive_ck,
        DROP CONSTRAINT IF EXISTS wallets_balance_nonnegative_ck;
    `);
  }
}