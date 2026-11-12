import { Money } from '../shared/money.js';

export type LedgerDirection = 'DEBIT' | 'CREDIT';

interface CreateLedgerEntryProps {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
}

export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
  ) {}

  static create(
    props: CreateLedgerEntryProps,
  ): WalletLedgerEntry {
    const entry = new WalletLedgerEntry(
      props.id,
      props.walletId,
      props.transactionId,
      props.direction,
      props.money,
      props.balanceBefore,
      props.balanceAfter,
    );

    if (!entry.isBalanced()) {
      throw new Error('Invalid ledger arithmetic');
    }

    return entry;
  }

  static restore(props: {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
  }): WalletLedgerEntry {
    return new WalletLedgerEntry(
      props.id,
      props.walletId,
      props.transactionId,
      props.direction,
      props.money,
      props.balanceBefore,
      props.balanceAfter,
    );
  }

  isBalanced(): boolean {
    if (this.direction === 'DEBIT') {
      return this.balanceBefore
        .subtract(this.money)
        .equals(this.balanceAfter);
    }

    return this.balanceBefore
      .add(this.money)
      .equals(this.balanceAfter);
  }
}