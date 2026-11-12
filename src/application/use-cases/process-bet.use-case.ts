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

export class ProcessBetUseCase {
  execute({
    wallet,
    transaction,
  }: ExecuteProps) {
    if (wallet.balance.isLessThan(transaction.money)) {
      transaction.reject('INSUFFICIENT_FUNDS');
      return {
        wallet,
        transaction,
        ledger: undefined,
      };
    }

    const balanceBefore = wallet.balance;

    wallet.debit(transaction.money);

    transaction.markProcessed();

    const ledger = WalletLedgerEntry.create({
      id: crypto.randomUUID(),
      walletId: wallet.id,
      transactionId: transaction.id,
      direction: 'DEBIT' as LedgerDirection,
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
