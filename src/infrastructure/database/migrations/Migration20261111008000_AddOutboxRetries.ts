import { Migration } from '@mikro-orm/migrations';

export class Migration20261111008000_AddOutboxRetries extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE outbox_events
        ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN next_attempt_at TIMESTAMP;

      ALTER TABLE outbox_events
        ADD CONSTRAINT outbox_events_attempts_ck CHECK (attempts >= 0);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE outbox_events
        DROP CONSTRAINT IF EXISTS outbox_events_attempts_ck,
        DROP COLUMN IF EXISTS next_attempt_at,
        DROP COLUMN IF EXISTS attempts;
    `);
  }
}