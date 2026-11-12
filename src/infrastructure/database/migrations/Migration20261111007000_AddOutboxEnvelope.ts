import { Migration } from '@mikro-orm/migrations';

export class Migration20261111007000_AddOutboxEnvelope extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE outbox_events
        ADD COLUMN correlation_id VARCHAR(255),
        ADD COLUMN causation_id VARCHAR(255),
        ADD COLUMN occurred_at TIMESTAMP,
        ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

      UPDATE outbox_events
      SET correlation_id = aggregate_id,
          occurred_at = created_at;

      ALTER TABLE outbox_events
        ALTER COLUMN correlation_id SET NOT NULL,
        ALTER COLUMN occurred_at SET NOT NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE outbox_events
        DROP COLUMN IF EXISTS version,
        DROP COLUMN IF EXISTS occurred_at,
        DROP COLUMN IF EXISTS causation_id,
        DROP COLUMN IF EXISTS correlation_id;
    `);
  }
}