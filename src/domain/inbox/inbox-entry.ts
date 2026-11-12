export enum InboxStatus {
  Pending = 'PENDING',
  Processed = 'PROCESSED',
  Failed = 'FAILED',
}

interface CreateInboxEntryProps {
  id: string;
  messageId: string;
  consumerName?: string;
  payloadHash?: string;
  receivedAt?: Date;
  type: string;
  payload: unknown;
}

export class InboxEntry {
  private constructor(
    public readonly id: string,
    public readonly messageId: string,
    public readonly consumerName: string,
    public readonly payloadHash: string | undefined,
    public readonly receivedAt: Date,
    public readonly type: string,
    public readonly payload: unknown,
    private _status: InboxStatus,
    private _processedAt: Date | undefined,
  ) {}

  static create(props: CreateInboxEntryProps): InboxEntry {
    return new InboxEntry(
      props.id,
      props.messageId,
      props.consumerName ?? 'wager-processor',
      props.payloadHash,
      props.receivedAt ?? new Date(),
      props.type,
      props.payload,
      InboxStatus.Pending,
      undefined,
    );
  }

  static restore(props: {
    id: string;
    messageId: string;
    consumerName?: string;
    payloadHash?: string;
    receivedAt?: Date;
    type: string;
    payload: unknown;
    status: InboxStatus;
    processedAt?: Date;
  }): InboxEntry {
    return new InboxEntry(
      props.id,
      props.messageId,
      props.consumerName ?? 'wager-processor',
      props.payloadHash,
      props.receivedAt ?? new Date(),
      props.type,
      props.payload,
      props.status,
      props.processedAt,
    );
  }

  get status(): InboxStatus {
    return this._status;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  isProcessed(): boolean {
    return this._status === InboxStatus.Processed;
  }

  markProcessed(at = new Date()): void {
    this._status = InboxStatus.Processed;
    this._processedAt = at;
  }

  markFailed(): void {
    this._status = InboxStatus.Failed;
  }
}
