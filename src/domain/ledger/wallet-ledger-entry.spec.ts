import { describe, expect, it } from 'vitest';
import { Money } from '../shared/money';
import { WalletLedgerEntry } from './wallet-ledger-entry';

describe('WalletLedgerEntry', () => {
  it('should create a valid debit entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'entry-1',
      walletId: 'wallet-1',
      transactionId: 'tx-1',
      direction: 'DEBIT',
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    expect(entry.isBalanced()).toBe(true);
  });

  it('should create a valid credit entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'entry-1',
      walletId: 'wallet-1',
      transactionId: 'tx-1',
      direction: 'CREDIT',
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '125.00',
        currency: 'BRL',
      }),
    });

    expect(entry.isBalanced()).toBe(true);
  });

  it('should reject invalid debit arithmetic', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: 'DEBIT',
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '90.00',
          currency: 'BRL',
        }),
      }),
    ).toThrow();
  });

  it('should reject invalid credit arithmetic', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: 'CREDIT',
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '120.00',
          currency: 'BRL',
        }),
      }),
    ).toThrow();
  });
});