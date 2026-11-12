import { WalletLedgerEntry } from '../../domain/ledger/wallet-ledger-entry.js';
import { WagerTransaction, WagerTransactionKind } from '../../domain/transaction/wager-transaction.js';
import { Wallet } from '../../domain/wallet/wallet.js';

interface ExecuteProps {
  wallet: Wallet;
  transaction: WagerTransaction;
  reference: WagerTransaction;
}

export class ProcessRollbackUseCase {
  execute({ wallet, transaction, reference }: ExecuteProps) {
    if (![
      WagerTransactionKind.Bet,
      WagerTransactionKind.Win,
      WagerTransactionKind.Loss,
    ].includes(reference.kind)) {
      transaction.reject('INVALID_REFERENCE');
      return { wallet, transaction, ledger: undefined };
    }

    if (reference.kind === WagerTransactionKind.Loss) {
      transaction.markProcessed(reference.id);
      return { wallet, transaction, ledger: undefined };
    }

    const balanceBefore = wallet.balance;

    if (reference.kind === WagerTransactionKind.Bet) {
      wallet.credit(transaction.money);
    } else if (wallet.balance.isLessThan(transaction.money)) {
      transaction.reject('REVERSAL_INSUFFICIENT_FUNDS');
      return { wallet, transaction, ledger: undefined };
    } else {
      wallet.debit(transaction.money);
    }

    transaction.markProcessed(reference.id);
    const direction = reference.kind === WagerTransactionKind.Bet
      ? 'CREDIT'
      : 'DEBIT';

    return {
      wallet,
      transaction,
      ledger: WalletLedgerEntry.create({
        id: crypto.randomUUID(),
        walletId: wallet.id,
        transactionId: transaction.id,
        direction,
        money: transaction.money,
        balanceBefore,
        balanceAfter: wallet.balance,
      }),
    };
  }
}