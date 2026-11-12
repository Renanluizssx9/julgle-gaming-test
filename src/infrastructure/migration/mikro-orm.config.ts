import { PostgreSqlDriver } from '@mikro-orm/postgresql';

import { InboxEntryEntity } from '../database/entities/inbox-entry.entity.js';
import { OutboxEventEntity } from '../database/entities/outbox-event.entity.js';
import { WagerTransactionEntity } from '../database/entities/wager-transaction.entity.js';
import { WalletLedgerEntryEntity } from '../database/entities/wallet-ledger-entry.entity.js';
import { WalletEntity } from '../database/entities/wallet.entity.js';

export default {
  driver: PostgreSqlDriver,

  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),

  user: process.env.DB_USER ?? 'wagering',
  password: process.env.DB_PASSWORD ?? 'wagering',
  dbName: process.env.DB_NAME ?? 'wagering',

  entities: [
    InboxEntryEntity,
    OutboxEventEntity,
    WalletEntity,
    WagerTransactionEntity,
    WalletLedgerEntryEntity,
  ],

  migrations: {
    path: './src/infrastructure/database/migrations',
    pathTs: './src/infrastructure/database/migrations',
  },
};