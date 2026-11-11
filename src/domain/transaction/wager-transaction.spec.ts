import { describe, expect, it } from 'bun:test';
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
});