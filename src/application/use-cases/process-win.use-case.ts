import { Wallet } from '../../domain/wallet/wallet.js';

import { WagerTransaction } from '../../domain/transaction/wager-transaction.js';

import {
  WalletLedgerEntry,
  LedgerDirection,
} from '../../domain/ledger/wallet-ledger-entry.js';

interface ExecuteProps {
  wallet: Wallet;
  transaction: WagerTransaction;
}

export class ProcessWinUseCase {
  execute({
    wallet,
    transaction,
  }: ExecuteProps) {
    const balanceBefore =
      wallet.balance;

    wallet.credit(
      transaction.money,
    );

    transaction.markProcessed();

    const ledger =
      WalletLedgerEntry.create({
        id: crypto.randomUUID(),
        walletId: wallet.id,
        transactionId: transaction.id,
        direction: 'CREDIT' as LedgerDirection,
        money: transaction.money,
        balanceBefore,
        balanceAfter: wallet.balance,
      });

    return {
      wallet,
      transaction,
      ledger,
    };
  }
}