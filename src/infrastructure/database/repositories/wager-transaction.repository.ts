import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

import { Money } from '../../../domain/shared/money.js';
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../domain/transaction/wager-transaction.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';

@Injectable()
export class WagerTransactionRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async lockDeduplicationKey(
    providerId: string,
    externalTransactionId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const keys = [
      `external:${providerId}:${externalTransactionId}`,
      `idempotency:${idempotencyKey}`,
    ].sort();

    for (const key of keys) {
      await this.em.getConnection().execute(
        'select pg_advisory_xact_lock(hashtextextended(?, 0))',
        [key],
        'all',
        this.em.getTransactionContext(),
      );
    }
  }

  async save(transaction: WagerTransaction): Promise<void> {
    const entity: any =
      (await this.em.findOne(WagerTransactionEntity as any, {
        id: transaction.id,
      })) ??
      this.em.create(WagerTransactionEntity as any, {
        id: transaction.id,
      } as any);

    entity.id = transaction.id;
    entity.providerId = transaction.providerId;
    entity.externalTransactionId = transaction.externalTransactionId;
    entity.idempotencyKey = transaction.idempotencyKey;
    entity.payloadHash = transaction.payloadHash ?? null;
    entity.walletId = transaction.walletId;
    entity.playerId = transaction.playerId;
    entity.roundId = transaction.roundId;
    entity.gameId = transaction.gameId;
    entity.kind = transaction.kind;
    entity.status = transaction.status;
    entity.amount = transaction.money.toString();
    entity.currency = transaction.money.currency;
    entity.referenceExternalTransactionId =
      transaction.referenceExternalTransactionId ?? null;
    entity.referenceTransactionId =
      transaction.referenceTransactionId ?? null;
    entity.failureCode = transaction.failureCode ?? null;
    entity.referenceAttempts = transaction.referenceAttempts;
    entity.nextReferenceAttemptAt =
      transaction.nextReferenceAttemptAt ?? null;

    this.em.persist(entity);
    await this.em.flush();
  }

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity as any, {
      id,
    });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async findByProviderAndExternalTransactionId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity as any, {
      providerId,
      externalTransactionId,
    });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async findByDeduplicationKey(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    return this.findByProviderAndExternalTransactionId(
      providerId,
      externalTransactionId,
    );
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<WagerTransaction | null> {
    const entity: any = await this.em.findOne(
      WagerTransactionEntity as any,
      { idempotencyKey },
    );

    return entity ? this.toDomain(entity) : null;
  }

  async findPendingReferences(
    limit = 100,
    now = new Date(),
  ): Promise<WagerTransaction[]> {
    const entities: any[] = await this.em.find(
      WagerTransactionEntity as any,
      {
        status: WagerTransactionStatus.PendingReference,
        $or: [
          { nextReferenceAttemptAt: null },
          { nextReferenceAttemptAt: { $lte: now } },
        ],
      },
      { orderBy: { createdAt: 'ASC' }, limit } as any,
    );

    return entities.map((entity) => this.toDomain(entity));
  }

  async findByReference(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    return this.findByProviderAndExternalTransactionId(
      providerId,
      externalTransactionId,
    );
  }

  async findReversal(
    referenceTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<WagerTransaction | null> {
    const entity: any = await this.em.findOne(
      WagerTransactionEntity as any,
      { referenceTransactionId, kind },
    );

    return entity ? this.toDomain(entity) : null;
  }

  async lockReversal(
    referenceTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<void> {
    const key = `reversal:${referenceTransactionId}:${kind}`;
    await this.em.getConnection().execute(
      'select pg_advisory_xact_lock(hashtextextended(?, 0))',
      [key],
      'all',
      this.em.getTransactionContext(),
    );
  }

  private toDomain(entity: any): WagerTransaction {
    return WagerTransaction.restore({
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash ?? undefined,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind as WagerTransactionKind,
      money: Money.from({
        amount: entity.amount.toString(),
        currency: entity.currency,
      }),
      referenceExternalTransactionId:
        entity.referenceExternalTransactionId ?? undefined,
      referenceTransactionId: entity.referenceTransactionId ?? undefined,
      failureCode: entity.failureCode ?? undefined,
      referenceAttempts: Number(entity.referenceAttempts ?? 0),
      nextReferenceAttemptAt:
        entity.nextReferenceAttemptAt ?? undefined,
      status: entity.status as WagerTransactionStatus,
    });
  }
}
