import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/core';

import { OutboxEvent, OutboxStatus } from '../../../domain/outbox/outbox-event.js';
import { OutboxEventEntity } from '../entities/outbox-event.entity.js';

@Injectable()
export class OutboxEventRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async save(event: OutboxEvent): Promise<void> {
    const entity: any =
      (await this.em.findOne(OutboxEventEntity as any, { id: event.id })) ??
      this.em.create(OutboxEventEntity as any, { id: event.id } as any);

    entity.aggregateType = event.aggregateType;
    entity.aggregateId = event.aggregateId;
    entity.type = event.type;
    entity.correlationId = event.correlationId;
    entity.causationId = event.causationId ?? null;
    entity.occurredAt = event.occurredAt;
    entity.version = event.version;
    entity.payload = event.payload;
    entity.status = event.status;
    entity.attempts = event.attempts;
    entity.nextAttemptAt = event.nextAttemptAt ?? null;
    entity.publishedAt = event.publishedAt ?? null;

    this.em.persist(entity);
    await this.em.flush();
  }

  async findPending(limit = 100, now = new Date()): Promise<OutboxEvent[]> {
    const entities: any[] = await this.em.find(
      OutboxEventEntity as any,
      {
        status: OutboxStatus.Pending,
        $or: [
          { nextAttemptAt: null },
          { nextAttemptAt: { $lte: now } },
        ],
      },
      { orderBy: { createdAt: 'ASC' }, limit } as any,
    );

    return entities.map((entity: any) =>
      OutboxEvent.restore({
        id: entity.id,
        aggregateType: entity.aggregateType,
        aggregateId: entity.aggregateId,
        type: entity.type,
        correlationId: entity.correlationId,
        causationId: entity.causationId ?? undefined,
        occurredAt: new Date(entity.occurredAt),
        version: Number(entity.version ?? 1),
        payload: entity.payload,
        status: entity.status as OutboxStatus,
        attempts: Number(entity.attempts ?? 0),
        nextAttemptAt: entity.nextAttemptAt ?? undefined,
        publishedAt: entity.publishedAt ?? undefined,
      }),
    );
  }

  async lockById(id: string): Promise<void> {
    await this.em.findOne(
      OutboxEventEntity as any,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } as any,
    );
  }

  async findById(id: string): Promise<OutboxEvent | null> {
    const entity: any = await this.em.findOne(OutboxEventEntity as any, { id });
    if (!entity) {
      return null;
    }

    return OutboxEvent.restore({
      id: entity.id,
      aggregateType: entity.aggregateType,
      aggregateId: entity.aggregateId,
      type: entity.type,
      correlationId: entity.correlationId,
      causationId: entity.causationId ?? undefined,
      occurredAt: new Date(entity.occurredAt),
      version: Number(entity.version ?? 1),
      payload: entity.payload,
      status: entity.status as OutboxStatus,
      attempts: Number(entity.attempts ?? 0),
      nextAttemptAt: entity.nextAttemptAt ?? undefined,
      publishedAt: entity.publishedAt ?? undefined,
    });
  }
}