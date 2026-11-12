import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/core';

import { Money } from '../../../domain/shared/money.js';
import { Wallet } from '../../../domain/wallet/wallet.js';
import { WalletEntity } from '../entities/wallet.entity.js';

@Injectable()
export class WalletRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async lockForUpdate(playerId: string, currency: string): Promise<void> {
    const key = `wallet:${playerId}:${currency}`;
    await this.em.getConnection().execute(
      'select pg_advisory_xact_lock(hashtextextended(?, 0))',
      [key],
      'all',
      this.em.getTransactionContext(),
    );
  }

  async save(wallet: Wallet): Promise<void> {
    const entity: any =
      (await this.em.findOne(WalletEntity as any, {
        id: wallet.id,
      })) ??
      this.em.create(WalletEntity as any, {
        id: wallet.id,
      } as any);

    entity.id = wallet.id;
    entity.playerId = wallet.playerId;
    entity.currency = wallet.currency;
    entity.balance = wallet.balance.toString();
    entity.version = wallet.version;
    entity.updatedAt = new Date();

    this.em.persist(entity);
    await this.em.flush();
  }

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity as any, { id });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null> {
    const entity = await this.em.findOne(
      WalletEntity as any,
      {
        playerId,
        currency,
      },
      { lockMode: LockMode.PESSIMISTIC_WRITE } as any,
    );

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  private toDomain(entity: any): Wallet {
    return Wallet.restore({
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.from({
        amount: entity.balance.toString(),
        currency: entity.currency,
      }),
      version: Number(entity.version),
    });
  }
}
