import { describe, expect, it } from 'vitest';

import { Money } from '../../domain/shared/money';
import { Wallet } from '../../domain/wallet/wallet';
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/transaction/wager-transaction';

import { ProcessBetUseCase } from './process-bet.use-case';

describe('ProcessBetUseCase', () => {
  it('should process a valid bet', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    const transaction =
      WagerTransaction.create({
        id: 'tx-1',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.Bet,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
      });

    const useCase =
      new ProcessBetUseCase();

    const result = useCase.execute({
      wallet,
      transaction,
    });

    expect(
      result.wallet.balance.toString(),
    ).toBe('75.00');

    expect(
      result.transaction.status,
    ).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(
      result.ledger.direction,
    ).toBe('DEBIT');
  });

  it('should audit insufficient balance without changing wallet or ledger', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '10.00',
        currency: 'BRL',
      }),
    });

    const transaction =
      WagerTransaction.create({
        id: 'tx-1',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.Bet,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
      });

    const useCase =
      new ProcessBetUseCase();

    const result = useCase.execute({ wallet, transaction });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.transaction.failureCode).toBe('INSUFFICIENT_FUNDS');
    expect(result.wallet.balance.toString()).toBe('10.00');
    expect(result.ledger).toBeUndefined();
  });
});