import { describe, expect, it } from 'bun:test';

import { Money } from '../../domain/shared/money';
import { Wallet } from '../../domain/wallet/wallet';

import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/transaction/wager-transaction';

import { ProcessLossUseCase } from './process-loss.use-case';

describe('ProcessLossUseCase', () => {
  it('should process a loss without changing balance', () => {
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
        kind: WagerTransactionKind.Loss,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
      });

    const useCase =
      new ProcessLossUseCase();

    const result = useCase.execute({
      wallet,
      transaction,
    });

    expect(
      result.wallet.balance.toString(),
    ).toBe('100.00');

    expect(
      result.transaction.status,
    ).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(result.ledger).toBeUndefined();
  });
});