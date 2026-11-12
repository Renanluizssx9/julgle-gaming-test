import { describe, expect, it } from 'vitest';

import { OutboxEvent, OutboxStatus } from './outbox-event';

describe('OutboxEvent', () => {
  it('should create a pending outbox event', () => {
    const event = OutboxEvent.create({
      id: 'outbox-1',
      aggregateType: 'wallet',
      aggregateId: 'wallet-1',
      type: 'WALLET_UPDATED',
      payload: { balance: '100.00' },
    });

    expect(event.status).toBe(OutboxStatus.Pending);
    expect(event.type).toBe('WALLET_UPDATED');
  });

  it('should mark an outbox event as published', () => {
    const event = OutboxEvent.create({
      id: 'outbox-2',
      aggregateType: 'wallet',
      aggregateId: 'wallet-1',
      type: 'WALLET_UPDATED',
      payload: { balance: '100.00' },
    });

    event.markPublished();

    expect(event.status).toBe(OutboxStatus.Published);
  });

  it('should serialize a versioned integration-event envelope', () => {
    const event = OutboxEvent.create({
      id: 'event-2',
      aggregateType: 'Wallet',
      aggregateId: 'wallet-2',
      type: 'WalletBalanceChanged',
      correlationId: 'correlation-2',
      causationId: 'transaction-2',
      payload: { amount: '10.00', currency: 'BRL' },
    });

    expect(event.toJSON()).toEqual({
      eventId: 'event-2',
      eventType: 'WalletBalanceChanged',
      aggregateId: 'wallet-2',
      correlationId: 'correlation-2',
      causationId: 'transaction-2',
      occurredAt: event.occurredAt.toISOString(),
      version: 1,
      data: { amount: '10.00', currency: 'BRL' },
    });
  });
});
