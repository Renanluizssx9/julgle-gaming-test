export const WAGER_METRICS = Symbol('WAGER_METRICS');

export class WagerMetrics {
  private readonly transactionsByStatus = new Map<string, number>();
  private duplicateReplays = 0;
  private retries = 0;
  private inboxFailures = 0;
  private lockConflicts = 0;
  private processingDurationMs = 0;
  private processingCount = 0;

  recordTransaction(status: string): void {
    this.transactionsByStatus.set(
      status,
      (this.transactionsByStatus.get(status) ?? 0) + 1,
    );
  }

  recordDuplicate(): void {
    this.duplicateReplays++;
  }

  recordRetry(): void {
    this.retries++;
  }

  recordInboxFailure(): void {
    this.inboxFailures++;
  }

  recordLockConflict(): void {
    this.lockConflicts++;
  }

  recordProcessingDuration(durationMs: number): void {
    this.processingDurationMs += durationMs;
    this.processingCount++;
  }

  render(
    outboxPending: number,
    outboxLagSeconds: number,
    dlqMessages: number,
    persistedRetries = 0,
  ): string {
    const lines = [
      '# TYPE wager_transactions_total counter',
      ...[...this.transactionsByStatus.entries()].map(
        ([status, count]) => `wager_transactions_total{status="${status}"} ${count}`,
      ),
      '# TYPE wager_idempotent_replays_total counter',
      `wager_idempotent_replays_total ${this.duplicateReplays}`,
      '# TYPE wager_retries_total counter',
      `wager_retries_total ${this.retries + persistedRetries}`,
      '# TYPE wager_inbox_failures_total counter',
      `wager_inbox_failures_total ${this.inboxFailures}`,
      '# TYPE wager_lock_conflicts_total counter',
      `wager_lock_conflicts_total ${this.lockConflicts}`,
      '# TYPE wager_processing_duration_ms summary',
      `wager_processing_duration_ms_count ${this.processingCount}`,
      `wager_processing_duration_ms_sum ${this.processingDurationMs.toFixed(2)}`,
      '# TYPE wager_outbox_pending gauge',
      `wager_outbox_pending ${outboxPending}`,
      '# TYPE wager_outbox_lag_seconds gauge',
      `wager_outbox_lag_seconds ${outboxLagSeconds.toFixed(3)}`,
      '# TYPE wager_sqs_dlq_messages gauge',
      `wager_sqs_dlq_messages ${dlqMessages}`,
    ];

    return `${lines.join('\n')}\n`;
  }
}
