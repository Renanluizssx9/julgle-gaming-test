import { defineEntity } from '@mikro-orm/core';

export const WalletEntity = defineEntity({
  name: 'Wallet',
  tableName: 'wallets',
  properties: {
    id: {
      type: 'uuid',
      primary: true,
    },
    playerId: {
      type: 'uuid',
    },
    currency: {
      type: 'string',
      length: 3,
    },
    balance: {
      type: 'decimal',
      precision: 18,
      scale: 2,
    },
    version: {
      type: 'number',
    },
    createdAt: {
      type: 'Date',
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: 'Date',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  uniques: [{ properties: ['playerId', 'currency'] }],
});