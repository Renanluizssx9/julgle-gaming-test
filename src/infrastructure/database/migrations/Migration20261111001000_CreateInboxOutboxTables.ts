import { Migration } from '@mikro-orm/migrations';

export class Migration20261111001000_CreateInboxOutboxTables extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS inbox_entries (
        id UUID PRIMARY KEY,
        message_id VARCHAR(255) NOT NULL UNIQUE,
        type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP NOT NULL,
        processed_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS inbox_entries_status_idx
        ON inbox_entries (status);

      CREATE TABLE IF NOT EXISTS outbox_events (
        id UUID PRIMARY KEY,
        aggregate_type VARCHAR(100) NOT NULL,
        aggregate_id VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP NOT NULL,
        published_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
        ON outbox_events (status, created_at);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP TABLE IF EXISTS outbox_events;
      DROP TABLE IF EXISTS inbox_entries;
    `);
  }
}