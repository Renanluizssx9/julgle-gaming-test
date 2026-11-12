import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { SQSClient } from '@aws-sdk/client-sqs';

import { ProcessWagerTransactionService } from './application/services/process-wager-transaction.service.js';
import { WalletApplicationService } from './application/services/wallet-application.service.js';
import { ProcessWagerTransactionController } from './interfaces/http/controllers/process-wager-transaction.controller.js';
import { WalletController } from './interfaces/http/controllers/wallet.controller.js';
import { WagerTransactionQueryController } from './interfaces/http/controllers/wager-transaction-query.controller.js';
import { HealthController } from './interfaces/http/controllers/health.controller.js';
import { MetricsController } from './interfaces/http/controllers/metrics.controller.js';
import { WAGER_METRICS, WagerMetrics } from './application/observability/wager-metrics.js';
import { WagerTransactionEntity } from './infrastructure/database/entities/wager-transaction.entity.js';
import { InboxEntryEntity } from './infrastructure/database/entities/inbox-entry.entity.js';
import { OutboxEventEntity } from './infrastructure/database/entities/outbox-event.entity.js';
import { WalletEntity } from './infrastructure/database/entities/wallet.entity.js';
import { WalletLedgerEntryEntity } from './infrastructure/database/entities/wallet-ledger-entry.entity.js';
import { InboxEntryRepository } from './infrastructure/database/repositories/inbox-entry.repository.js';
import { OutboxEventRepository } from './infrastructure/database/repositories/outbox-event.repository.js';
import { WalletRepository } from './infrastructure/database/repositories/wallet.repository.js';
import { WagerTransactionRepository } from './infrastructure/database/repositories/wager-transaction.repository.js';
import { WalletLedgerEntryRepository } from './infrastructure/database/repositories/wallet-ledger-entry.repository.js';
import {
  SQS_CLIENT,
  SQS_QUEUE_CONFIG,
  SqsMessagingWorker,
} from './infrastructure/messaging/sqs-messaging-worker.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        driver: PostgreSqlDriver,
        host: config.get<string>('DB_HOST') ?? 'localhost',
        port: Number(config.get<string>('DB_PORT') ?? 5432),
        user: config.get<string>('DB_USER') ?? 'wagering',
        password: config.get<string>('DB_PASSWORD') ?? 'wagering',
        dbName: config.get<string>('DB_NAME') ?? 'wagering',
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
      }),
    }),
    MikroOrmModule.forFeature([
      InboxEntryEntity,
      OutboxEventEntity,
      WalletEntity,
      WagerTransactionEntity,
      WalletLedgerEntryEntity,
    ]),
  ],
  controllers: [
    ProcessWagerTransactionController,
    WalletController,
    WagerTransactionQueryController,
    HealthController,
    MetricsController,
  ],
  providers: [
    { provide: WAGER_METRICS, useValue: new WagerMetrics() },
    {
      provide: SQS_CLIENT,
      useFactory: (config: ConfigService) => {
        const endpoint = config.get<string>('SQS_ENDPOINT');

        return new SQSClient({
          region: config.get<string>('AWS_REGION') ?? 'us-east-1',
          ...(endpoint
            ? {
                endpoint,
                credentials: {
                  accessKeyId:
                    config.get<string>('AWS_ACCESS_KEY_ID') ?? 'test',
                  secretAccessKey:
                    config.get<string>('AWS_SECRET_ACCESS_KEY') ?? 'test',
                },
              }
            : {}),
        });
      },
      inject: [ConfigService],
    },
    {
      provide: SQS_QUEUE_CONFIG,
      useFactory: (config: ConfigService) => ({
        outboxQueueUrl: config.get<string>('SQS_OUTBOX_QUEUE_URL'),
        inboxQueueUrl: config.get<string>('SQS_INBOX_QUEUE_URL'),
        deadLetterQueueUrl: config.get<string>('SQS_DLQ_QUEUE_URL'),
      }),
      inject: [ConfigService],
    },
    SqsMessagingWorker,
    InboxEntryRepository,
    OutboxEventRepository,
    WalletRepository,
    WagerTransactionRepository,
    WalletLedgerEntryRepository,
    WalletApplicationService,
    {
      provide: ProcessWagerTransactionService,
      useFactory: (
        walletRepository: WalletRepository,
        wagerTransactionRepository: WagerTransactionRepository,
        walletLedgerEntryRepository: WalletLedgerEntryRepository,
        entityManager: EntityManager,
        outboxEventRepository: OutboxEventRepository,
        inboxEntryRepository: InboxEntryRepository,
        metrics: WagerMetrics,
      ) =>
        new ProcessWagerTransactionService(
          walletRepository,
          wagerTransactionRepository,
          walletLedgerEntryRepository,
          {
            run: <Result>(operation: () => Promise<Result>) =>
              entityManager.transactional(() => operation()),
          },
          outboxEventRepository,
          inboxEntryRepository,
          metrics,
        ),
      inject: [
        WalletRepository,
        WagerTransactionRepository,
        WalletLedgerEntryRepository,
        EntityManager,
        OutboxEventRepository,
        InboxEntryRepository,
        WAGER_METRICS,
      ],
    },
  ],
})
export class AppModule {}
