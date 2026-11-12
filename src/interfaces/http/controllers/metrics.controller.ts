import {
  Controller,
  Get,
  Header,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';

import { WAGER_METRICS, WagerMetrics } from '../../../application/observability/wager-metrics.js';
import { SQS_CLIENT } from '../../../infrastructure/messaging/sqs-messaging-worker.js';

@Controller()
export class MetricsController {
  constructor(
    @Inject(WAGER_METRICS) private readonly metrics: WagerMetrics,
    @Inject(EntityManager) private readonly em: EntityManager,
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
    private readonly config: ConfigService,
  ) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metricsText(): Promise<string> {
    const outboxStats: any = await this.em.getConnection().execute(
      `SELECT count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              coalesce(extract(epoch FROM (now() - min(created_at)
                FILTER (WHERE status = 'PENDING'))), 0)::float AS lag_seconds,
              coalesce(sum(attempts), 0)::int AS outbox_retries
       FROM outbox_events`,
      [],
      'get',
    );
    const referenceStats: any = await this.em.getConnection().execute(
      'SELECT coalesce(sum(reference_attempts), 0)::int AS attempts FROM wager_transactions',
      [],
      'get',
    );

    let dlqMessages = 0;
    const dlqQueueUrl = this.config.get<string>('SQS_DLQ_QUEUE_URL');
    if (dlqQueueUrl) {
      try {
        const result = await this.sqs.send(
          new GetQueueAttributesCommand({
            QueueUrl: dlqQueueUrl,
            AttributeNames: ['ApproximateNumberOfMessages'],
          }),
        );
        dlqMessages = Number(result.Attributes?.ApproximateNumberOfMessages ?? 0);
      } catch {
        dlqMessages = -1;
      }
    }

    return this.metrics.render(
      Number(outboxStats?.pending ?? 0),
      Number(outboxStats?.lag_seconds ?? 0),
      dlqMessages,
      Number(outboxStats?.outbox_retries ?? 0) +
        Number(referenceStats?.attempts ?? 0),
    );
  }
}
