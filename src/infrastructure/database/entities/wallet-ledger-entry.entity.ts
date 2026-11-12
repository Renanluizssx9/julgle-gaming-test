import { defineEntity } from '@mikro-orm/core';

export const WalletLedgerEntryEntity = defineEntity({
  name: 'WalletLedgerEntry',
  tableName: 'wallet_ledger_entries',
  properties: {
    id: {
      type: 'uuid',
      primary: true,
    },
    walletId: {
      type: 'uuid',
    },
    transactionId: {
      type: 'uuid',
    },
    direction: {
      type: 'string',
      length: 10,
    },
    amount: {
      type: 'decimal',
      precision: 18,
      scale: 2,
    },
    balanceBefore: {
      type: 'decimal',
      precision: 18,
      scale: 2,
    },
    balanceAfter: {
      type: 'decimal',
      precision: 18,
      scale: 2,
    },
    createdAt: {
      type: 'Date',
      onCreate: () => new Date(),
    },
  },
  uniques: [{ properties: ['transactionId'] }],
});