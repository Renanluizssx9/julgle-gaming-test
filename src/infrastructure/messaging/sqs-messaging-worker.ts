import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { EntityManager, RequestContext } from '@mikro-orm/core';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { InboxEntry } from '../../domain/inbox/inbox-entry.js';
import { ProcessWagerTransactionService } from '../../application/services/process-wager-transaction.service.js';
import { WAGER_METRICS, WagerMetrics } from '../../application/observability/wager-metrics.js';
import { hashWagerPayload } from '../../application/services/wager-payload-hash.js';
import { WagerTransactionKind } from '../../domain/transaction/wager-transaction.js';
import { OutboxEventRepository } from '../database/repositories/outbox-event.repository.js';

export const SQS_CLIENT = Symbol('SQS_CLIENT');
export const SQS_QUEUE_CONFIG = Symbol('SQS_QUEUE_CONFIG');
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

export function retryDelayMs(failureCount: number): number {
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, failureCount - 1),
    MAX_RETRY_DELAY_MS,
  );
}

interface SqsQueueConfig {
  outboxQueueUrl?: string;
  inboxQueueUrl?: string;
}

@Injectable()
export class SqsMessagingWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SqsMessagingWorker.name);
  private running = false;
  private workerPromise?: Promise<void>;

  constructor(
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
    @Inject(OutboxEventRepository)
    private readonly outboxRepository: OutboxEventRepository,
    @Inject(SQS_QUEUE_CONFIG) private readonly queues: SqsQueueConfig,
    @Inject(EntityManager) private readonly em: EntityManager,
    @Inject(ProcessWagerTransactionService)
    private readonly processWagerTransaction: ProcessWagerTransactionService,
    @Inject(WAGER_METRICS) private readonly metrics = new WagerMetrics(),
  ) {}

  onApplicationBootstrap(): void {
    if (!this.queues.outboxQueueUrl || !this.queues.inboxQueueUrl) {
      this.logger.log('SQS worker disabled: queue URLs are not configured.');
      return;
    }

    this.running = true;
    this.workerPromise = this.poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.workerPromise;
    this.sqs.destroy();
  }

  async publishPendingOutbox(): Promise<void> {
    if (!this.queues.outboxQueueUrl) {
      return;
    }

    await this.em.transactional(async () => {
      const events = await this.outboxRepository.findPending(10);

      for (const event of events) {
        await this.outboxRepository.lockById(event.id);
        const current = await this.outboxRepository.findById(event.id);
        if (!current || !current.isDue(new Date())) {
          continue;
        }

        try {
          await this.sqs.send(
            new SendMessageCommand({
              QueueUrl: this.queues.outboxQueueUrl,
              MessageBody: JSON.stringify(current.toJSON()),
            }),
          );

          current.markPublished();
          await this.outboxRepository.save(current);
        } catch (error) {
          current.scheduleRetry();
          await this.outboxRepository.save(current);
          this.metrics.recordRetry();
          this.logger.error(
            `Could not publish Outbox event ${current.id}; attempt ${current.attempts} scheduled.`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    });
  }

  async consumeInboxOnce(): Promise<void> {
    if (!this.queues.inboxQueueUrl) {
      return;
    }

    const response = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queues.inboxQueueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2,
      }),
    );

    for (const message of response.Messages ?? []) {
      if (!message.Body || !message.ReceiptHandle) {
        continue;
      }

      try {
        await this.processInboxMessage(message.Body, message.MessageId);
        await this.sqs.send(
          new DeleteMessageCommand({
            QueueUrl: this.queues.inboxQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      } catch (error) {
        this.metrics.recordInboxFailure();
        this.logger.error(
          `Could not process SQS message ${message.MessageId ?? 'unknown'}.`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private async processInboxMessage(
    body: string,
    sqsMessageId?: string,
  ): Promise<void> {
    const payload: unknown = JSON.parse(body);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('SQS message body must be a JSON object');
    }

    const envelope = payload as Record<string, unknown>;
    const messageId =
      typeof envelope.messageId === 'string'
        ? envelope.messageId
        : sqsMessageId;
    if (!messageId) {
      throw new Error('SQS message is missing a stable message id');
    }

    if (envelope.type !== 'WagerTransactionRequested') {
      throw new Error(`Unsupported SQS message type: ${String(envelope.type)}`);
    }

    const data = this.asRecord(envelope.data, 'data');
    const money = this.asRecord(data.money, 'data.money');
    const kind = this.requiredString(data.kind, 'data.kind') as WagerTransactionKind;
    const transactionInput = {
      providerId: this.requiredString(data.providerId, 'data.providerId'),
      externalTransactionId: this.requiredString(
        data.externalTransactionId,
        'data.externalTransactionId',
      ),
      idempotencyKey: this.requiredString(
        data.idempotencyKey,
        'data.idempotencyKey',
      ),
      playerId: this.requiredString(data.playerId, 'data.playerId'),
      walletId: this.requiredString(data.walletId, 'data.walletId'),
      roundId: this.requiredString(data.roundId, 'data.roundId'),
      gameId: this.requiredString(data.gameId, 'data.gameId'),
      kind,
      amount: this.requiredString(money.amount, 'data.money.amount'),
      currency: this.requiredString(money.currency, 'data.money.currency'),
      referenceExternalTransactionId:
        typeof data.referenceExternalTransactionId === 'string'
          ? data.referenceExternalTransactionId
          : undefined,
    };

    await this.processWagerTransaction.processFromInbox(
      transactionInput,
      {
        messageId,
        type: 'WagerTransactionRequested',
        payloadHash: hashWagerPayload(transactionInput),
        payload,
      },
    );
  }

  private asRecord(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`SQS message ${name} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private requiredString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`SQS message ${name} must be a non-empty string`);
    }
    return value;
  }

  private async poll(): Promise<void> {
    let consecutiveFailures = 0;

    while (this.running) {
      let delay = BASE_RETRY_DELAY_MS;

      try {
        await RequestContext.create(this.em, async () => {
          await this.publishPendingOutbox();
          await this.consumeInboxOnce();
          await this.processWagerTransaction.processPendingReferences();
        });
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures++;
        delay = retryDelayMs(consecutiveFailures);
        this.logger.error(
          'SQS polling iteration failed.',
          error instanceof Error ? error.stack : undefined,
        );
      }

      if (this.running) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}