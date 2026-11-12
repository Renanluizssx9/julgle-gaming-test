import { defineEntity } from '@mikro-orm/core';

export const InboxEntryEntity = defineEntity({
  name: 'InboxEntry',
  tableName: 'inbox_entries',
  properties: {
    id: {
      type: 'uuid',
      primary: true,
    },
    messageId: {
      type: 'string',
      length: 255,
    },
    consumerName: {
      type: 'string',
      length: 100,
    },
    payloadHash: {
      type: 'string',
      length: 64,
      nullable: true,
    },
    type: {
      type: 'string',
      length: 100,
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
    processedAt: {
      type: 'Date',
      nullable: true,
    },
  },
  uniques: [{ properties: ['consumerName', 'messageId'] }],
});