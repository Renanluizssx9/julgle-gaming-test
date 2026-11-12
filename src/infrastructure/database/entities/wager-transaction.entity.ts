import { defineEntity } from '@mikro-orm/core';

export const WagerTransactionEntity = defineEntity({
  name: 'WagerTransaction',
  tableName: 'wager_transactions',
  properties: {
    id: {
      type: 'uuid',
      primary: true,
    },
    providerId: {
      type: 'string',
      length: 100,
    },
    externalTransactionId: {
      type: 'string',
      length: 255,
    },
    idempotencyKey: {
      type: 'string',
      length: 512,
    },
    payloadHash: {
      type: 'string',
      length: 64,
      nullable: true,
    },
    walletId: {
      type: 'uuid',
    },
    playerId: {
      type: 'uuid',
    },
    roundId: {
      type: 'string',
      length: 255,
    },
    gameId: {
      type: 'string',
      length: 255,
    },
    kind: {
      type: 'string',
      length: 50,
    },
    status: {
      type: 'string',
      length: 50,
    },
    amount: {
      type: 'decimal',
      precision: 18,
      scale: 2,
    },
    currency: {
      type: 'string',
      length: 3,
    },
    referenceExternalTransactionId: {
      type: 'string',
      length: 255,
      nullable: true,
    },
    referenceTransactionId: {
      type: 'uuid',
      nullable: true,
    },
    failureCode: {
      type: 'string',
      length: 100,
      nullable: true,
    },
    referenceAttempts: {
      type: 'number',
    },
    nextReferenceAttemptAt: {
      type: 'Date',
      nullable: true,
    },
    createdAt: {
      type: 'Date',
      onCreate: () => new Date(),
    },
  },
  uniques: [
    { properties: ['providerId', 'externalTransactionId'] },
    { properties: ['idempotencyKey'] },
  ],
});