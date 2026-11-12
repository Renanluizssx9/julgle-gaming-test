import { Wallet } from '../../domain/wallet/wallet.js';

import { WagerTransaction } from '../../domain/transaction/wager-transaction.js';

interface ExecuteProps {
  wallet: Wallet;
  transaction: WagerTransaction;
}

export class ProcessLossUseCase {
  execute({
    wallet,
    transaction,
  }: ExecuteProps) {
    transaction.markProcessed();

    return {
      wallet,
      transaction,
      ledger: undefined,
    };
  }
}