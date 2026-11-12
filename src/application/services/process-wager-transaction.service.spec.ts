import { describe, expect, it } from 'vitest';

import { Money } from '../../domain/shared/money.js';
import { IdempotencyConflictError } from '../errors/idempotency-conflict.error.js';
import {
  WagerTransaction,
  WagerTransactionKind,
} from '../../domain/transaction/wager-transaction.js';
import { Wallet } from '../../domain/wallet/wallet.js';
import { ProcessWagerTransactionService } from './process-wager-transaction.service.js';

describe('ProcessWagerTransactionService', () => {
  it('should process a bet and persist the wallet and transaction once', async () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    const walletRepository = {
      lockForUpdate: async () => undefined,
      findByPlayerIdAndCurrency: async () => wallet,
      save: async () => undefined,
    };

    const transactionRepository = {
      lockDeduplicationKey: async () => undefined,
      findByIdempotencyKey: async () => null,
      findByDeduplicationKey: async () => null,
      save: async () => undefined,
    };

    const ledgerRepository = {
      save: async () => undefined,
    };
    const outboxEvents: unknown[] = [];

    const service = new ProcessWagerTransactionService(
      walletRepository as any,
      transactionRepository as any,
      ledgerRepository as any,
      undefined,
      {
        save: async (event) => {
          outboxEvents.push(event);
        },
      },
    );

    const result = await service.process({
      walletId: 'wallet-1',
      playerId: 'player-1',
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      amount: '25.00',
      currency: 'BRL',
    });

    expect(result.duplicate).toBe(false);
    expect(result.transaction.status).toBe('PROCESSED');
    expect(result.wallet.balance.toString()).toBe('75.00');
    expect(outboxEvents).toHaveLength(1);
  });

  it('should ignore duplicate processing based on provider + external transaction id', async () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    const existingTransaction = WagerTransaction.create({
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

    existingTransaction.markProcessed();

    const walletRepository = {
      lockForUpdate: async () => undefined,
      findByPlayerIdAndCurrency: async () => wallet,
      save: async () => undefined,
    };

    const transactionRepository = {
      lockDeduplicationKey: async () => undefined,
      findByIdempotencyKey: async () => existingTransaction,
      findByDeduplicationKey: async () => null,
      save: async () => undefined,
    };

    const ledgerRepository = {
      save: async () => undefined,
    };

    const service = new ProcessWagerTransactionService(
      walletRepository as any,
      transactionRepository as any,
      ledgerRepository as any,
    );

    const result = await service.process({
      walletId: 'wallet-1',
      playerId: 'player-1',
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      amount: '25.00',
      currency: 'BRL',
    });

    expect(result.duplicate).toBe(true);
    expect(result.transaction.id).toBe('tx-1');
  });

  it('should reject the same idempotency key with a different payload', async () => {
    const existingTransaction = WagerTransaction.create({
      id: 'tx-1',
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
    });
    existingTransaction.markProcessed();

    const service = new ProcessWagerTransactionService(
      {
        lockForUpdate: async () => undefined,
        findByPlayerIdAndCurrency: async () => null,
        save: async () => undefined,
      } as any,
      {
        lockDeduplicationKey: async () => undefined,
        findByIdempotencyKey: async () => existingTransaction,
        findByDeduplicationKey: async () => null,
        save: async () => undefined,
      } as any,
      { save: async () => undefined } as any,
    );

    await expect(
      service.process({
        walletId: 'wallet-1',
        playerId: 'player-1',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.Bet,
        amount: '26.00',
        currency: 'BRL',
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('should run persistence inside the transaction boundary', async () => {
    const calls: string[] = [];
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    const service = new ProcessWagerTransactionService(
      {
        lockForUpdate: async () => undefined,
        findByPlayerIdAndCurrency: async () => wallet,
        save: async () => {
          calls.push('wallet');
        },
      } as any,
      {
        lockDeduplicationKey: async () => undefined,
        findByIdempotencyKey: async () => null,
        findByDeduplicationKey: async () => null,
        save: async () => {
          calls.push('transaction');
          throw new Error('persistence failed');
        },
      } as any,
      {
        save: async () => {
          calls.push('ledger');
        },
      } as any,
      {
        run: async (operation) => {
          calls.push('begin');
          try {
            const result = await operation();
            calls.push('commit');
            return result;
          } catch (error) {
            calls.push('rollback');
            throw error;
          }
        },
      },
      { save: async () => undefined },
    );

    await expect(
      service.process({
        walletId: 'wallet-1',
        playerId: 'player-1',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.Bet,
        amount: '25.00',
        currency: 'BRL',
      }),
    ).rejects.toThrow('persistence failed');

    expect(calls).toEqual(['begin', 'wallet', 'transaction', 'rollback']);
  });

  it('should persist Inbox state and the wager in one transaction', async () => {
    const inboxStatuses: string[] = [];
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.zero('BRL'),
    });
    let transactionRuns = 0;

    const service = new ProcessWagerTransactionService(
      {
        lockForUpdate: async () => undefined,
        findByPlayerIdAndCurrency: async () => null,
        save: async () => undefined,
      } as any,
      {
        lockDeduplicationKey: async () => undefined,
        findByIdempotencyKey: async () => null,
        findByDeduplicationKey: async () => null,
        save: async () => undefined,
      } as any,
      { save: async () => undefined } as any,
      {
        run: async (operation) => {
          transactionRuns++;
          return operation();
        },
      },
      { save: async () => undefined },
      {
        lockMessageId: async () => undefined,
        findByMessageId: async () => null,
        save: async (entry) => {
          inboxStatuses.push(entry.status);
        },
      },
    );

    await service.processFromInbox(
      {
        walletId: 'wallet-1',
        playerId: 'player-1',
        providerId: 'provider-a',
        externalTransactionId: 'inbox-transaction-1',
        idempotencyKey: 'provider-a:inbox-transaction-1',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.Win,
        amount: '5.00',
        currency: 'BRL',
      },
      {
        messageId: 'message-1',
        type: 'WagerTransactionRequested',
        payloadHash: 'a'.repeat(64),
        payload: { messageId: 'message-1' },
      },
    );

    expect(transactionRuns).toBe(1);
    expect(inboxStatuses).toEqual(['PENDING', 'PROCESSED']);
  });

  it('should refund a processed bet once with a credit ledger entry', async () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({ amount: '75.00', currency: 'BRL' }),
    });
    const reference = WagerTransaction.create({
      id: 'bet-1',
      providerId: 'provider-a',
      externalTransactionId: 'bet-ext-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
    });
    reference.markProcessed();
    let savedLedger: any;

    const service = new ProcessWagerTransactionService(
      {
        lockForUpdate: async () => undefined,
        findByPlayerIdAndCurrency: async () => wallet,
        save: async () => undefined,
      } as any,
      {
        lockDeduplicationKey: async () => undefined,
        findByIdempotencyKey: async () => null,
        findByDeduplicationKey: async () => null,
        findByReference: async () => reference,
        lockReversal: async () => undefined,
        findReversal: async () => null,
        save: async () => undefined,
      } as any,
      { save: async (entry: any) => { savedLedger = entry; } } as any,
    );

    const result = await service.process({
      walletId: 'wallet-1',
      playerId: 'player-1',
      providerId: 'provider-a',
      externalTransactionId: 'refund-ext-1',
      idempotencyKey: 'provider-a:refund-ext-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId: 'bet-ext-1',
    });

    expect(result.transaction.status).toBe('PROCESSED');
    expect(result.transaction.referenceTransactionId).toBe('bet-1');
    expect(result.wallet.balance.toString()).toBe('100.00');
    expect(savedLedger.direction).toBe('CREDIT');
  });

  it('should persist a reversal as pending when its reference has not arrived', async () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.zero('BRL'),
    });
    let savedTransaction: WagerTransaction | undefined;

    const service = new ProcessWagerTransactionService(
      {
        lockForUpdate: async () => undefined,
        findByPlayerIdAndCurrency: async () => wallet,
        save: async () => undefined,
      } as any,
      {
        lockDeduplicationKey: async () => undefined,
        findByIdempotencyKey: async () => null,
        findByDeduplicationKey: async () => null,
        findByReference: async () => null,
        lockReversal: async () => undefined,
        findReversal: async () => null,
        save: async (transaction: WagerTransaction) => {
          savedTransaction = transaction;
        },
      } as any,
      { save: async () => undefined } as any,
    );

    const result = await service.process({
      walletId: 'wallet-1',
      playerId: 'player-1',
      providerId: 'provider-a',
      externalTransactionId: 'refund-ext-2',
      idempotencyKey: 'provider-a:refund-ext-2',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId: 'bet-not-yet-here',
    });

    expect(result.transaction.status).toBe('PENDING_REFERENCE');
    expect(savedTransaction).toBe(result.transaction);
    expect(result.wallet.balance.toString()).toBe('0.00');
  });

  it('should rollback a win with a debit ledger entry', async () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({ amount: '25.00', currency: 'BRL' }),
    });
    const reference = WagerTransaction.create({
      id: 'win-1',
      providerId: 'provider-a',
      externalTransactionId: 'win-ext-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Win,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
    });
    reference.markProcessed();
    let savedLedger: any;

    const service = new ProcessWagerTransactionService(
      {
        lockForUpdate: async () => undefined,
        findByPlayerIdAndCurrency: async () => wallet,
        save: async () => undefined,
      } as any,
      {
        lockDeduplicationKey: async () => undefined,
        findByIdempotencyKey: async () => null,
        findByDeduplicationKey: async () => null,
        findByReference: async () => reference,
        lockReversal: async () => undefined,
        findReversal: async () => null,
        save: async () => undefined,
      } as any,
      { save: async (entry: any) => { savedLedger = entry; } } as any,
    );

    const result = await service.process({
      walletId: 'wallet-1',
      playerId: 'player-1',
      providerId: 'provider-a',
      externalTransactionId: 'rollback-ext-1',
      idempotencyKey: 'provider-a:rollback-ext-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId: 'win-ext-1',
    });

    expect(result.transaction.status).toBe('PROCESSED');
    expect(result.wallet.balance.toString()).toBe('0.00');
    expect(savedLedger.direction).toBe('DEBIT');
  });

  it('should process a pending reversal after its reference arrives', async () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({ amount: '75.00', currency: 'BRL' }),
    });
    const pending = WagerTransaction.create({
      id: 'refund-1',
      providerId: 'provider-a',
      externalTransactionId: 'refund-ext-3',
      idempotencyKey: 'provider-a:refund-ext-3',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
      referenceExternalTransactionId: 'bet-ext-3',
    });
    pending.markPendingReference();
    const reference = WagerTransaction.create({
      id: 'bet-3',
      providerId: 'provider-a',
      externalTransactionId: 'bet-ext-3',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
    });
    reference.markProcessed();
    let savedLedger: any;

    const service = new ProcessWagerTransactionService(
      {
        lockForUpdate: async () => undefined,
        findByPlayerIdAndCurrency: async () => wallet,
        save: async () => undefined,
      } as any,
      {
        lockDeduplicationKey: async () => undefined,
        findByIdempotencyKey: async () => null,
        findByDeduplicationKey: async () => pending,
        findByReference: async () => reference,
        lockReversal: async () => undefined,
        findReversal: async () => null,
        findPendingReferences: async () => [pending],
        save: async () => undefined,
      } as any,
      { save: async (entry: any) => { savedLedger = entry; } } as any,
      { run: async (operation) => operation() },
      { save: async () => undefined },
    );

    await service.processPendingReferences();

    expect(pending.status).toBe('PROCESSED');
    expect(pending.referenceTransactionId).toBe('bet-3');
    expect(wallet.balance.toString()).toBe('100.00');
    expect(savedLedger.direction).toBe('CREDIT');
  });
});
