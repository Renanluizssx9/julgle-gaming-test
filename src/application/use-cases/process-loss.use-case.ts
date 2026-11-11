import { Wallet } from '../../domain/wallet/wallet';

import { WagerTransaction } from '../../domain/transaction/wager-transaction';

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