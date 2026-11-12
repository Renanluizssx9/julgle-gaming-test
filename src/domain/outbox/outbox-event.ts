export enum OutboxStatus {
  Pending = 'PENDING',
  Published = 'PUBLISHED',
  Failed = 'FAILED',
}

interface CreateOutboxEventProps {
  id: string;
  aggregateType: string;
  aggregateId: string;
  type: string;
  correlationId?: string;
  causationId?: string;
  occurredAt?: Date;
  version?: number;
  attempts?: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
  payload: unknown;
}

export class OutboxEvent {
  private constructor(
    public readonly id: string,
    public readonly aggregateType: string,
    public readonly aggregateId: string,
    public readonly type: string,
    public readonly correlationId: string,
    public readonly causationId: string | undefined,
    public readonly occurredAt: Date,
    public readonly version: number,
    public readonly payload: unknown,
    private _status: OutboxStatus,
    private _attempts: number,
    private _nextAttemptAt: Date | undefined,
    private _publishedAt: Date | undefined,
  ) {}

  static create(props: CreateOutboxEventProps): OutboxEvent {
    return new OutboxEvent(
      props.id,
      props.aggregateType,
      props.aggregateId,
      props.type,
      props.correlationId ?? props.aggregateId,
      props.causationId,
      props.occurredAt ?? new Date(),
      props.version ?? 1,
      props.payload,
      OutboxStatus.Pending,
      props.attempts ?? 0,
      props.nextAttemptAt,
      props.publishedAt,
    );
  }

  static restore(props: {
    id: string;
    aggregateType: string;
    aggregateId: string;
    type: string;
    correlationId?: string;
    causationId?: string;
    occurredAt?: Date;
    version?: number;
    attempts?: number;
    nextAttemptAt?: Date;
    publishedAt?: Date;
    payload: unknown;
    status: OutboxStatus;
  }): OutboxEvent {
    return new OutboxEvent(
      props.id,
      props.aggregateType,
      props.aggregateId,
      props.type,
      props.correlationId ?? props.aggregateId,
      props.causationId,
      props.occurredAt ?? new Date(),
      props.version ?? 1,
      props.payload,
      props.status,
      props.attempts ?? 0,
      props.nextAttemptAt,
      props.publishedAt,
    );
  }

  get status(): OutboxStatus {
    return this._status;
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }

  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return this._status === OutboxStatus.Pending;
  }

  isDue(now: Date): boolean {
    return this.isPending() && (!this._nextAttemptAt || this._nextAttemptAt <= now);
  }

  toJSON() {
    return {
      eventId: this.id,
      eventType: this.type,
      aggregateId: this.aggregateId,
      correlationId: this.correlationId,
      ...(this.causationId ? { causationId: this.causationId } : {}),
      occurredAt: this.occurredAt.toISOString(),
      version: this.version,
      data: this.payload,
    };
  }

  markPublished(at = new Date()): void {
    this._status = OutboxStatus.Published;
    this._publishedAt = at;
    this._nextAttemptAt = undefined;
  }

  scheduleRetry(now = new Date()): void {
    if (!this.isPending()) {
      throw new Error('Only pending outbox events can be retried');
    }
    this._attempts++;
    const delayMs = Math.min(1_000 * 2 ** (this._attempts - 1), 30_000);
    this._nextAttemptAt = new Date(now.getTime() + delayMs);
  }

  markFailed(): void {
    this._status = OutboxStatus.Failed;
    this._nextAttemptAt = undefined;
  }
}
