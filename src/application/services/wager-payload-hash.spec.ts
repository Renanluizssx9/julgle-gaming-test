import { describe, expect, it } from 'vitest';

import { WagerTransactionKind } from '../../domain/transaction/wager-transaction.js';
import { hashWagerPayload } from './wager-payload-hash.js';

describe('hashWagerPayload', () => {
  const payload = {
    providerId: 'provider-a',
    externalTransactionId: 'external-1',
    walletId: 'wallet-1',
    playerId: 'player-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.Bet,
    amount: '25.00',
    currency: 'BRL',
  };

  it('is deterministic for the same business payload', () => {
    expect(hashWagerPayload(payload)).toBe(hashWagerPayload({ ...payload }));
  });

  it('changes when a business field changes', () => {
    expect(hashWagerPayload(payload)).not.toBe(
      hashWagerPayload({ ...payload, amount: '26.00' }),
    );
  });
});