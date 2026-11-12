import { Money } from '../shared/money.js';

export enum WagerTransactionKind {
  Opening = 'OPENING',
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

export type WagerFailureCode =
  | 'INSUFFICIENT_FUNDS'
  | 'REFERENCE_NOT_FOUND'
  | 'INVALID_REFERENCE'
  | 'ALREADY_REVERSED'
  | 'REVERSAL_INSUFFICIENT_FUNDS';

interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey?: string;
  payloadHash?: string;
  referenceTransactionId?: string;
  referenceAttempts?: number;
  nextReferenceAttemptAt?: Date;
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
    public readonly idempotencyKey: string,
    public readonly payloadHash: string | undefined,
    private _referenceTransactionId: string | undefined,
    private _failureCode: WagerFailureCode | undefined,
    private _referenceAttempts: number,
    private _nextReferenceAttemptAt: Date | undefined,
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
    if (!props.money.isPositive()) {
      throw new Error('Transaction amount must be positive');
    }

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
      props.idempotencyKey ??
        `${props.providerId}:${props.externalTransactionId}`,
      props.payloadHash,
      props.referenceTransactionId,
      undefined,
      props.referenceAttempts ?? 0,
      props.nextReferenceAttemptAt,
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

  static restore(props: {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey?: string;
    payloadHash?: string;
    referenceTransactionId?: string;
    failureCode?: WagerFailureCode;
    referenceAttempts?: number;
    nextReferenceAttemptAt?: Date;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: Money;
    referenceExternalTransactionId?: string;
    status: WagerTransactionStatus;
  }): WagerTransaction {
    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey ??
        `${props.providerId}:${props.externalTransactionId}`,
      props.payloadHash,
      props.referenceTransactionId,
      props.failureCode,
      props.referenceAttempts ?? 0,
      props.nextReferenceAttemptAt,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      props.status,
    );
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): WagerFailureCode | undefined {
    return this._failureCode;
  }

  get referenceAttempts(): number {
    return this._referenceAttempts;
  }

  get nextReferenceAttemptAt(): Date | undefined {
    return this._nextReferenceAttemptAt;
  }

  get deduplicationKey(): string {
    return `${this.providerId}:${this.externalTransactionId}`;
  }

  isTerminal(): boolean {
    return [
      WagerTransactionStatus.Processed,
      WagerTransactionStatus.Rejected,
      WagerTransactionStatus.Failed,
    ].includes(this._status);
  }

  markProcessed(referenceTransactionId?: string): void {
    this.assertNotTerminal();
    this._referenceTransactionId = referenceTransactionId;
    this._nextReferenceAttemptAt = undefined;
    this._status =
      WagerTransactionStatus.Processed;
  }

  markPendingReference(): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.PendingReference;
  }

  scheduleReferenceRetry(now = new Date(), maxAttempts = 8): boolean {
    this.assertNotTerminal();
    if (this._referenceAttempts >= maxAttempts) {
      this.reject('REFERENCE_NOT_FOUND');
      this._nextReferenceAttemptAt = undefined;
      return false;
    }

    this._referenceAttempts++;
    const delayMs = Math.min(
      1_000 * 2 ** (this._referenceAttempts - 1),
      30_000,
    );
    this._nextReferenceAttemptAt = new Date(now.getTime() + delayMs);
    this._status = WagerTransactionStatus.PendingReference;
    return true;
  }

  reject(code: WagerFailureCode): void {
    this.assertNotTerminal();
    this._failureCode = code;
    this._nextReferenceAttemptAt = undefined;
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