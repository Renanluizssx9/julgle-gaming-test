import { WalletLedgerEntry } from '../../domain/ledger/wallet-ledger-entry.js';
import { WagerTransaction, WagerTransactionKind } from '../../domain/transaction/wager-transaction.js';
import { Wallet } from '../../domain/wallet/wallet.js';

interface ExecuteProps {
  wallet: Wallet;
  transaction: WagerTransaction;
  reference: WagerTransaction;
}

export class ProcessRefundUseCase {
  execute({ wallet, transaction, reference }: ExecuteProps) {
    if (reference.kind !== WagerTransactionKind.Bet) {
      transaction.reject('INVALID_REFERENCE');
      return { wallet, transaction, ledger: undefined };
    }

    const balanceBefore = wallet.balance;
    wallet.credit(transaction.money);
    transaction.markProcessed(reference.id);

    return {
      wallet,
      transaction,
      ledger: WalletLedgerEntry.create({
        id: crypto.randomUUID(),
        walletId: wallet.id,
        transactionId: transaction.id,
        direction: 'CREDIT',
        money: transaction.money,
        balanceBefore,
        balanceAfter: wallet.balance,
      }),
    };
  }
}