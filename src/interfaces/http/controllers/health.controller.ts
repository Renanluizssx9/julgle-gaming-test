import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';

import { SQS_CLIENT } from '../../../infrastructure/messaging/sqs-messaging-worker.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(EntityManager) private readonly em: EntityManager,
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
    private readonly config: ConfigService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const outboxQueueUrl = this.config.get<string>('SQS_OUTBOX_QUEUE_URL');
    const inboxQueueUrl = this.config.get<string>('SQS_INBOX_QUEUE_URL');
    if (!outboxQueueUrl || !inboxQueueUrl) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        postgres: 'unknown',
        sqs: 'not_configured',
      });
    }

    try {
      await this.em.getConnection().execute('select 1');
      await Promise.all(
        [outboxQueueUrl, inboxQueueUrl].map((QueueUrl) =>
          this.sqs.send(
            new GetQueueAttributesCommand({
              QueueUrl,
              AttributeNames: ['QueueArn'],
            }),
          ),
        ),
      );
      return { status: 'ready', postgres: 'ok', sqs: 'ok' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        postgres: 'or_sqs_unavailable',
      });
    }
  }
}
