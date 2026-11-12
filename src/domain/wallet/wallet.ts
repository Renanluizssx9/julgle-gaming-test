import { Money } from '../shared/money.js';

interface OpenWalletProps {
  id: string;
  playerId: string;
  initialBalance: Money;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
  ) {}

  static open(props: OpenWalletProps): Wallet {
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
    );
  }

  static restore(props: {
    id: string;
    playerId: string;
    currency: string;
    balance: Money;
    version: number;
  }): Wallet {
    return new Wallet(
      props.id,
      props.playerId,
      props.currency,
      props.balance,
      props.version,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  credit(money: Money): void {
    this.assertSameCurrency(money);

    this._balance = this._balance.add(money);
    this._version++;
  }

  debit(money: Money): void {
    this.assertSameCurrency(money);

    const newBalance = this._balance.subtract(money);

    if (newBalance.isNegative()) {
      throw new Error('Insufficient balance');
    }

    this._balance = newBalance;
    this._version++;
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new Error('Currency mismatch');
    }
  }
}