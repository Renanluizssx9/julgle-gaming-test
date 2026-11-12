import { defineEntity } from '@mikro-orm/core';

export const OutboxEventEntity = defineEntity({
  name: 'OutboxEvent',
  tableName: 'outbox_events',
  properties: {
    id: {
      type: 'uuid',
      primary: true,
    },
    aggregateType: {
      type: 'string',
      length: 100,
    },
    aggregateId: {
      type: 'string',
      length: 255,
    },
    type: {
      type: 'string',
      length: 100,
    },
    correlationId: {
      type: 'string',
      length: 255,
    },
    causationId: {
      type: 'string',
      length: 255,
      nullable: true,
    },
    occurredAt: {
      type: 'Date',
    },
    version: {
      type: 'number',
    },
    attempts: {
      type: 'number',
    },
    nextAttemptAt: {
      type: 'Date',
      nullable: true,
    },
    payload: {
      type: 'json',
      columnType: 'jsonb',
    },
    status: {
      type: 'string',
      length: 20,
    },
    createdAt: {
      type: 'Date',
      onCreate: () => new Date(),
    },
    publishedAt: {
      type: 'Date',
      nullable: true,
    },
  },
});