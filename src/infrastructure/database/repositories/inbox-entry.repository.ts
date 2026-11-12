import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

import { InboxEntry, InboxStatus } from '../../../domain/inbox/inbox-entry.js';
import { InboxEntryEntity } from '../entities/inbox-entry.entity.js';

@Injectable()
export class InboxEntryRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async lockMessageId(
    messageId: string,
    consumerName = 'wager-processor',
  ): Promise<void> {
    const key = `inbox:${consumerName}:${messageId}`;
    await this.em.getConnection().execute(
      'select pg_advisory_xact_lock(hashtextextended(?, 0))',
      [key],
      'all',
      this.em.getTransactionContext(),
    );
  }

  async save(entry: InboxEntry): Promise<void> {
    const entity: any =
      (await this.em.findOne(InboxEntryEntity as any, { id: entry.id })) ??
      this.em.create(InboxEntryEntity as any, { id: entry.id } as any);

    entity.messageId = entry.messageId;
    entity.consumerName = entry.consumerName;
    entity.payloadHash = entry.payloadHash ?? null;
    entity.createdAt = entry.receivedAt;
    entity.type = entry.type;
    entity.payload = entry.payload;
    entity.status = entry.status;
    entity.processedAt = entry.processedAt ?? null;

    this.em.persist(entity);
    await this.em.flush();
  }

  async findByMessageId(
    messageId: string,
    consumerName = 'wager-processor',
  ): Promise<InboxEntry | null> {
    const entity: any = await this.em.findOne(InboxEntryEntity as any, {
      messageId,
      consumerName,
    });

    if (!entity) {
      return null;
    }

    return InboxEntry.restore({
      id: entity.id,
      messageId: entity.messageId,
      consumerName: entity.consumerName,
      payloadHash: entity.payloadHash ?? undefined,
      receivedAt: new Date(entity.createdAt),
      type: entity.type,
      payload: entity.payload,
      status: entity.status as InboxStatus,
      processedAt: entity.processedAt
        ? new Date(entity.processedAt)
        : undefined,
    });
  }
}