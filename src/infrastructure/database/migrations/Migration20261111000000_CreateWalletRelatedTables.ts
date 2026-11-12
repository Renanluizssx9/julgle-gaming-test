import { Migration } from '@mikro-orm/migrations';

export class Migration20261111000000_CreateWalletRelatedTables extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS wallets (
        id UUID PRIMARY KEY,
        player_id UUID NOT NULL,
        currency VARCHAR(3) NOT NULL,
        balance NUMERIC(18,2) NOT NULL,
        version BIGINT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        UNIQUE (player_id, currency)
      );

      CREATE TABLE IF NOT EXISTS wager_transactions (
        id UUID PRIMARY KEY,
        provider_id VARCHAR(100) NOT NULL,
        external_transaction_id VARCHAR(255) NOT NULL,
        wallet_id UUID NOT NULL,
        player_id UUID NOT NULL,
        round_id VARCHAR(255) NOT NULL,
        game_id VARCHAR(255) NOT NULL,
        kind VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        amount NUMERIC(18,2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        reference_external_transaction_id VARCHAR(255),
        created_at TIMESTAMP NOT NULL,
        UNIQUE (provider_id, external_transaction_id)
      );

      CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
        id UUID PRIMARY KEY,
        wallet_id UUID NOT NULL,
        transaction_id UUID NOT NULL,
        direction VARCHAR(10) NOT NULL,
        amount NUMERIC(18,2) NOT NULL,
        balance_before NUMERIC(18,2) NOT NULL,
        balance_after NUMERIC(18,2) NOT NULL,
        created_at TIMESTAMP NOT NULL
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP TABLE IF EXISTS wallet_ledger_entries;
      DROP TABLE IF EXISTS wager_transactions;
      DROP TABLE IF EXISTS wallets;
    `);
  }
}
