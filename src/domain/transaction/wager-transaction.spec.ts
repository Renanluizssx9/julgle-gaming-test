import { describe, expect, it } from 'vitest';
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction';

import { Money } from '../shared/money';

describe('WagerTransaction', () => {
  it('should create a bet transaction', () => {
    const tx = WagerTransaction.create({
      id: 'tx-1',
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    expect(tx.status).toBe(
      WagerTransactionStatus.Pending,
    );
  });

  it('should require reference for refund', () => {
    expect(() =>
      WagerTransaction.create({
        id: 'tx-1',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        walletId: 'wallet-1',
        playerId: 'player-1',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.Refund,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
      }),
    ).toThrow();
  });

  it('should back off missing references and reject after eight attempts', () => {
    const tx = WagerTransaction.create({
      id: 'tx-refund',
      providerId: 'provider-a',
      externalTransactionId: 'refund-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
      referenceExternalTransactionId: 'bet-not-yet-here',
    });
    const now = new Date('2026-11-11T00:00:00.000Z');

    tx.markPendingReference();
    expect(tx.scheduleReferenceRetry(now)).toBe(true);
    expect(tx.referenceAttempts).toBe(1);
    expect(tx.nextReferenceAttemptAt?.getTime()).toBe(now.getTime() + 1_000);

    for (let attempt = 2; attempt <= 8; attempt++) {
      expect(tx.scheduleReferenceRetry(now)).toBe(true);
    }
    expect(tx.referenceAttempts).toBe(8);
    expect(tx.nextReferenceAttemptAt?.getTime()).toBe(now.getTime() + 30_000);

    expect(tx.scheduleReferenceRetry(now)).toBe(false);
    expect(tx.status).toBe(WagerTransactionStatus.Rejected);
    expect(tx.failureCode).toBe('REFERENCE_NOT_FOUND');
  });

  it('should mark transaction as processed', () => {
    const tx = WagerTransaction.create({
      id: 'tx-1',
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    tx.markProcessed();

    expect(tx.status).toBe(
      WagerTransactionStatus.Processed,
    );
  });

  it('should reject terminal transitions', () => {
    const tx = WagerTransaction.create({
      id: 'tx-1',
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    tx.markProcessed();

    expect(() => {
      tx.reject('ERROR');
    }).toThrow();
  });

  it('should identify terminal states', () => {
    const tx = WagerTransaction.create({
      id: 'tx-1',
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    tx.markProcessed();

    expect(tx.isTerminal()).toBe(true);
  });

  it('should generate a deduplication key from provider and external transaction id', () => {
    const tx = WagerTransaction.create({
      id: 'tx-1',
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    expect(tx.deduplicationKey).toBe(
      'provider-a:ext-1',
    );
  });
});