import { EntityManager, LockMode } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';

import { WalletRepository } from './wallet.repository.js';

describe('WalletRepository', () => {
  it('locks the wallet row while reading it by player and currency', async () => {
    const findOne = vi.fn(async () => null);
    const repository = new WalletRepository({ findOne } as unknown as EntityManager);

    await repository.findByPlayerIdAndCurrency('player-1', 'BRL');

    expect(findOne).toHaveBeenCalledWith(
      expect.anything(),
      { playerId: 'player-1', currency: 'BRL' },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
  });
});