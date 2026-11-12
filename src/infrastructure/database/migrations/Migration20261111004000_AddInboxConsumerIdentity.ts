import { Migration } from '@mikro-orm/migrations';

export class Migration20261111004000_AddInboxConsumerIdentity extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE inbox_entries
        DROP CONSTRAINT IF EXISTS inbox_entries_message_id_key,
        ADD COLUMN consumer_name VARCHAR(100) NOT NULL DEFAULT 'wager-processor',
        ADD COLUMN payload_hash VARCHAR(64);

      CREATE UNIQUE INDEX inbox_entries_consumer_message_uq
        ON inbox_entries (consumer_name, message_id);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP INDEX IF EXISTS inbox_entries_consumer_message_uq;
      ALTER TABLE inbox_entries
        DROP COLUMN IF EXISTS payload_hash,
        DROP COLUMN IF EXISTS consumer_name;
      ALTER TABLE inbox_entries
        ADD CONSTRAINT inbox_entries_message_id_key UNIQUE (message_id);
    `);
  }
}