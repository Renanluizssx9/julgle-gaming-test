import { createHash } from 'node:crypto';

import { WagerTransactionKind } from '../../domain/transaction/wager-transaction.js';

export interface WagerPayloadForHash {
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  amount: string;
  currency: string;
  referenceExternalTransactionId?: string;
}

export function hashWagerPayload(payload: WagerPayloadForHash): string {
  const canonicalPayload = JSON.stringify({
    amount: payload.amount,
    currency: payload.currency,
    externalTransactionId: payload.externalTransactionId,
    gameId: payload.gameId,
    kind: payload.kind,
    playerId: payload.playerId,
    providerId: payload.providerId,
    referenceExternalTransactionId:
      payload.referenceExternalTransactionId ?? null,
    roundId: payload.roundId,
    walletId: payload.walletId,
  });

  return createHash('sha256').update(canonicalPayload).digest('hex');
}