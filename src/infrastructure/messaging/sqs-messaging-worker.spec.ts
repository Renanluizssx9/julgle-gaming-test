import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { describe, expect, it, vi } from 'vitest';

import { InboxEntry } from '../../domain/inbox/inbox-entry.js';
import { OutboxEvent, OutboxStatus } from '../../domain/outbox/outbox-event.js';
import { ProcessWagerTransactionService } from '../../application/services/process-wager-transaction.service.js';
import { hashWagerPayload } from '../../application/services/wager-payload-hash.js';
import { OutboxEventRepository } from '../database/repositories/outbox-event.repository.js';
import { retryDelayMs, SqsMessagingWorker } from './sqs-messaging-worker.js';

describe('SqsMessagingWorker', () => {
  it('backs off repeated worker failures up to 30 seconds', () => {
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(2)).toBe(2_000);
    expect(retryDelayMs(3)).toBe(4_000);
    expect(retryDelayMs(10)).toBe(30_000);
  });

  it('publishes pending events and marks them published', async () => {
    const event = OutboxEvent.create({
      id: 'event-1',
      aggregateType: 'WagerTransaction',
      aggregateId: 'transaction-1',
      type: 'WAGER_TRANSACTION_PROCESSED',
      payload: { balance: '10.00' },
    });
    const send = vi.fn(async () => ({}));
    const outboxRepository = {
      findPending: vi.fn(async () => [event]),
      lockById: vi.fn(async () => undefined),
      findById: vi.fn(async () => event),
      save: vi.fn(async () => undefined),
    };
    const worker = new SqsMessagingWorker(
      { send, destroy: vi.fn() } as any,
      outboxRepository as any,
      { outboxQueueUrl: 'outbox-url', inboxQueueUrl: 'inbox-url' },
      { transactional: async (operation: () => Promise<void>) => operation() } as any,
      {} as ProcessWagerTransactionService,
    );

    await worker.publishPendingOutbox();

    expect(send).toHaveBeenCalledWith(expect.any(SendMessageCommand));
    expect(event.status).toBe(OutboxStatus.Published);
    expect(outboxRepository.save).toHaveBeenCalledWith(event);
  });

  it('records an Outbox retry when SQS publication fails', async () => {
    const event = OutboxEvent.create({
      id: 'event-retry',
      aggregateType: 'WagerTransaction',
      aggregateId: 'transaction-retry',
      type: 'WAGER_TRANSACTION_PROCESSED',
      payload: { amount: '1.00' },
    });
    const outboxRepository = {
      findPending: vi.fn(async () => [event]),
      lockById: vi.fn(async () => undefined),
      findById: vi.fn(async () => event),
      save: vi.fn(async () => undefined),
    };
    const worker = new SqsMessagingWorker(
      {
        send: vi.fn(async () => {
          throw new Error('SQS unavailable');
        }),
        destroy: vi.fn(),
      } as any,
      outboxRepository as any,
      { outboxQueueUrl: 'outbox-url' },
      { transactional: async (operation: () => Promise<void>) => operation() } as any,
      {} as ProcessWagerTransactionService,
    );

    await worker.publishPendingOutbox();

    expect(event.attempts).toBe(1);
    expect(event.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
    expect(event.status).toBe(OutboxStatus.Pending);
    expect(outboxRepository.save).toHaveBeenCalledWith(event);
  });

  it('stores a received message before deleting it from SQS', async () => {
    const message = {
      messageId: 'event-2',
      type: 'WagerTransactionRequested',
      occurredAt: '2026-11-11T00:00:00.000Z',
      data: {
        providerId: 'provider-a',
        externalTransactionId: 'external-2',
        idempotencyKey: 'provider-a:external-2',
        walletId: 'wallet-2',
        playerId: 'player-2',
        roundId: 'round-2',
        gameId: 'game-2',
        kind: 'WIN',
        money: { amount: '10.00', currency: 'BRL' },
      },
    };
    const send = vi.fn(async (command: any) =>
      command instanceof ReceiveMessageCommand
        ? {
            Messages: [
              {
                MessageId: 'sqs-message-2',
                ReceiptHandle: 'receipt-2',
                Body: JSON.stringify(message),
              },
            ],
          }
        : {},
    );
    const processFromInbox = vi.fn(async () => undefined);
    const worker = new SqsMessagingWorker(
      { send, destroy: vi.fn() } as any,
      {} as OutboxEventRepository,
      { outboxQueueUrl: 'outbox-url', inboxQueueUrl: 'inbox-url' },
      {} as any,
      { processFromInbox } as any,
    );

    await worker.consumeInboxOnce();

    expect(processFromInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'provider-a',
        externalTransactionId: 'external-2',
        amount: '10.00',
      }),
      expect.objectContaining({
        messageId: 'event-2',
        payloadHash: hashWagerPayload({
          providerId: 'provider-a',
          externalTransactionId: 'external-2',
          idempotencyKey: 'provider-a:external-2',
          walletId: 'wallet-2',
          playerId: 'player-2',
          roundId: 'round-2',
          gameId: 'game-2',
          kind: 'WIN',
          amount: '10.00',
          currency: 'BRL',
          referenceExternalTransactionId: undefined,
        }),
      }),
    );
    expect(send).toHaveBeenCalledWith(expect.any(DeleteMessageCommand));
  });

  it('does not acknowledge a message if the financial use case fails', async () => {
    const send = vi.fn(async (command: any) =>
      command instanceof ReceiveMessageCommand
        ? {
            Messages: [
              {
                MessageId: 'sqs-message-3',
                ReceiptHandle: 'receipt-3',
                Body: JSON.stringify({
                  messageId: 'event-3',
                  type: 'WagerTransactionRequested',
                  data: {
                    providerId: 'provider-a',
                    externalTransactionId: 'external-3',
                    idempotencyKey: 'provider-a:external-3',
                    walletId: 'wallet-3',
                    playerId: 'player-3',
                    roundId: 'round-3',
                    gameId: 'game-3',
                    kind: 'BET',
                    money: { amount: '10.00', currency: 'BRL' },
                  },
                }),
              },
            ],
          }
        : {},
    );
    const processFromInbox = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const worker = new SqsMessagingWorker(
      { send, destroy: vi.fn() } as any,
      {} as OutboxEventRepository,
      { outboxQueueUrl: 'outbox-url', inboxQueueUrl: 'inbox-url' },
      {} as any,
      { processFromInbox } as any,
    );

    await worker.consumeInboxOnce();

    expect(processFromInbox).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalledWith(expect.any(DeleteMessageCommand));
  });
});