import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

import { Money } from '../../domain/shared/money.js';
import { WalletLedgerEntry } from '../../domain/ledger/wallet-ledger-entry.js';
import { OutboxEvent } from '../../domain/outbox/outbox-event.js';
import { WagerTransaction, WagerTransactionKind } from '../../domain/transaction/wager-transaction.js';
import { Wallet } from '../../domain/wallet/wallet.js';
import { WalletLedgerEntryRepository } from '../../infrastructure/database/repositories/wallet-ledger-entry.repository.js';
import { OutboxEventRepository } from '../../infrastructure/database/repositories/outbox-event.repository.js';
import { WalletRepository } from '../../infrastructure/database/repositories/wallet.repository.js';
import { WagerTransactionRepository } from '../../infrastructure/database/repositories/wager-transaction.repository.js';

export interface CreateWalletInput {
  playerId: string;
  initialBalance: string;
  currency: string;
}

@Injectable()
export class WalletApplicationService {
  constructor(
    @Inject(EntityManager) private readonly em: EntityManager,
    private readonly wallets: WalletRepository,
    private readonly transactions: WagerTransactionRepository,
    private readonly ledger: WalletLedgerEntryRepository,
    private readonly outbox: OutboxEventRepository,
  ) {}

  async create(input: CreateWalletInput): Promise<Wallet> {
    return this.em.transactional(async () => {
      await this.wallets.lockForUpdate(input.playerId, input.currency);
      const existing = await this.wallets.findByPlayerIdAndCurrency(
        input.playerId,
        input.currency,
      );
      if (existing) {
        throw new Error('WALLET_ALREADY_EXISTS');
      }

      const initialBalance = Money.from({
        amount: input.initialBalance,
        currency: input.currency,
      });
      const wallet = Wallet.open({
        id: crypto.randomUUID(),
        playerId: input.playerId,
        initialBalance,
      });

      await this.wallets.save(wallet);

      if (initialBalance.isPositive()) {
        const transaction = WagerTransaction.create({
          id: crypto.randomUUID(),
          providerId: '__internal__',
          externalTransactionId: `opening:${wallet.id}`,
          idempotencyKey: `opening:${wallet.id}`,
          payloadHash: undefined,
          walletId: wallet.id,
          playerId: wallet.playerId,
          roundId: 'opening',
          gameId: 'internal',
          kind: WagerTransactionKind.Opening,
          money: initialBalance,
        });
        transaction.markProcessed();

        const ledgerEntry = WalletLedgerEntry.create({
          id: crypto.randomUUID(),
          walletId: wallet.id,
          transactionId: transaction.id,
          direction: 'CREDIT',
          money: initialBalance,
          balanceBefore: Money.zero(input.currency),
          balanceAfter: initialBalance,
        });

        await this.transactions.save(transaction);
        await this.ledger.save(ledgerEntry);
        await this.outbox.save(
          OutboxEvent.create({
            id: crypto.randomUUID(),
            aggregateType: 'Wallet',
            aggregateId: wallet.id,
            type: 'WALLET_OPENED',
            payload: {
              walletId: wallet.id,
              playerId: wallet.playerId,
              money: initialBalance.toJSON(),
              transactionId: transaction.id,
              ledgerId: ledgerEntry.id,
              walletVersion: wallet.version,
            },
          }),
        );
      }

      return wallet;
    });
  }

  async reconcile(wallet: Wallet) {
    const entries = await this.ledger.findAllByWalletId(wallet.id);
    let calculated = Money.zero(wallet.currency);

    for (const entry of entries) {
      const amount = Money.from({
        amount: entry.amount.toString(),
        currency: wallet.currency,
      });
      calculated = entry.direction === 'DEBIT'
        ? calculated.subtract(amount)
        : calculated.add(amount);
    }

    const difference = wallet.balance.subtract(calculated);
    return {
      walletId: wallet.id,
      storedBalance: wallet.balance.toJSON(),
      calculatedBalance: calculated.toJSON(),
      difference: difference.toJSON(),
      consistent: difference.isZero(),
      checkedEntries: entries.length,
    };
  }
}
