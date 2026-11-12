import { describe, expect, it } from 'vitest';
import { Money } from './money';

describe('Money', () => {
  it('should create valid money', () => {
    const money = Money.from({
      amount: '25.00',
      currency: 'BRL',
    });

    expect(money.toString()).toBe('25.00');
  });

  it('should create zero money', () => {
    const money = Money.zero('BRL');

    expect(money.toString()).toBe('0.00');
  });

  it('should add values', () => {
    const a = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '5.00',
      currency: 'BRL',
    });

    expect(a.add(b).toString()).toBe('15.00');
  });

  it('should subtract values', () => {
    const a = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '3.00',
      currency: 'BRL',
    });

    expect(a.subtract(b).toString()).toBe('7.00');
  });

  it('should negate value', () => {
    const money = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    expect(money.negate().toString()).toBe('-10.00');
  });

  it('should compare equal values', () => {
    const a = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    expect(a.equals(b)).toBe(true);
  });

  it('should compare different values', () => {
    const a = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '20.00',
      currency: 'BRL',
    });

    expect(a.equals(b)).toBe(false);
  });

  it('should reject empty string', () => {
    expect(() =>
      Money.from({
        amount: '',
        currency: 'BRL',
      }),
    ).toThrow();
  });

  it('should reject more than two decimal places', () => {
    expect(() =>
      Money.from({
        amount: '25.999',
        currency: 'BRL',
      }),
    ).toThrow();
  });

  it('should reject negative values', () => {
    expect(() =>
      Money.from({
        amount: '-10.00',
        currency: 'BRL',
      }),
    ).toThrow();
  });

  it('should reject scientific notation', () => {
    expect(() =>
      Money.from({
        amount: '1e10',
        currency: 'BRL',
      }),
    ).toThrow();
  });

  it('should reject Infinity', () => {
    expect(() =>
      Money.from({
        amount: 'Infinity',
        currency: 'BRL',
      }),
    ).toThrow();
  });

  it('should reject NaN', () => {
    expect(() =>
      Money.from({
        amount: 'NaN',
        currency: 'BRL',
      }),
    ).toThrow();
  });

  it('should reject operations between different currencies', () => {
    const brl = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const usd = Money.from({
      amount: '10.00',
      currency: 'USD',
    });

    expect(() => brl.add(usd)).toThrow();
  });

  it('should not mutate original instance after add', () => {
    const a = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '5.00',
      currency: 'BRL',
    });

    const result = a.add(b);

    expect(a.toString()).toBe('10.00');
    expect(result.toString()).toBe('15.00');
  });

  it('should not mutate original instance after subtract', () => {
    const a = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '3.00',
      currency: 'BRL',
    });

    const result = a.subtract(b);

    expect(a.toString()).toBe('10.00');
    expect(result.toString()).toBe('7.00');
  });
    it('should identify zero value', () => {
    const money = Money.zero('BRL');

    expect(money.isZero()).toBe(true);
  });

  it('should not treat zero as positive', () => {
    expect(Money.zero('BRL').isPositive()).toBe(false);
  });

  it('should identify positive value', () => {
    const money = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    expect(money.isPositive()).toBe(true);
  });

  it('should identify negative value', () => {
    const money = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    expect(money.negate().isNegative()).toBe(true);
  });

  it('should compare lower value', () => {
    const a = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '20.00',
      currency: 'BRL',
    });

    expect(a.isLessThan(b)).toBe(true);
  });

  it('should compare higher value', () => {
    const a = Money.from({
      amount: '20.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    expect(a.isLessThan(b)).toBe(false);
  });

  it('should serialize to json', () => {
    const money = Money.from({
      amount: '25.00',
      currency: 'BRL',
    });

    expect(money.toJSON()).toEqual({
      amount: '25.00',
      currency: 'BRL',
    });
  });
});