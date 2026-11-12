import { describe, expect, it } from 'vitest';
import { Wallet } from './wallet';
import { Money } from '../shared/money';

describe('Wallet', () => {
  it('should open wallet', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(1);
  });

  it('should credit wallet', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    wallet.credit(
      Money.from({
        amount: '50.00',
        currency: 'BRL',
      }),
    );

    expect(wallet.balance.toString()).toBe('150.00');
  });

  it('should debit wallet', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    wallet.debit(
      Money.from({
        amount: '80.00',
        currency: 'BRL',
      }),
    );

    expect(wallet.balance.toString()).toBe('20.00');
  });

  it('should reject insufficient balance', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    expect(() =>
      wallet.debit(
        Money.from({
          amount: '150.00',
          currency: 'BRL',
        }),
      ),
    ).toThrow();
  });

  it('should increment version when balance changes', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    wallet.credit(
      Money.from({
        amount: '10.00',
        currency: 'BRL',
      }),
    );

    expect(wallet.version).toBe(2);
  });

  it('should reject different currency operations', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    expect(() =>
      wallet.credit(
        Money.from({
          amount: '10.00',
          currency: 'USD',
        }),
      ),
    ).toThrow();
  });
});