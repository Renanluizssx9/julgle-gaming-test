import { Money } from '../shared/money';

export enum WagerTransactionKind {
  Bet = 'BET',
  Win = 'WIN',
  Loss = 'LOSS',
  Refund = 'REFUND',
  Rollback = 'ROLLBACK',
}

export enum WagerTransactionStatus {
  Pending = 'PENDING',
  PendingReference = 'PENDING_REFERENCE',
  Processed = 'PROCESSED',
  Rejected = 'REJECTED',
  Failed = 'FAILED',
}

interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
}

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    private _status: WagerTransactionStatus,
  ) {}

  static create(
    props: CreateWagerTransactionProps,
  ): WagerTransaction {
    const requiresReference =
      props.kind === WagerTransactionKind.Refund ||
      props.kind === WagerTransactionKind.Rollback;

    if (
      requiresReference &&
      !props.referenceExternalTransactionId
    ) {
      throw new Error(
        'Reference transaction is required',
      );
    }

    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      WagerTransactionStatus.Pending,
    );
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  isTerminal(): boolean {
    return [
      WagerTransactionStatus.Processed,
      WagerTransactionStatus.Rejected,
      WagerTransactionStatus.Failed,
    ].includes(this._status);
  }

  markProcessed(): void {
    this.assertNotTerminal();
    this._status =
      WagerTransactionStatus.Processed;
  }

  reject(code: string): void {
    this.assertNotTerminal();
    this._status =
      WagerTransactionStatus.Rejected;
  }

  private assertNotTerminal(): void {
    if (this.isTerminal()) {
      throw new Error(
        'Cannot change terminal transaction',
      );
    }
  }
}