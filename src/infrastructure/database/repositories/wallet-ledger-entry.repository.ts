import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

import { Money } from '../../../domain/shared/money.js';
import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../../domain/ledger/wallet-ledger-entry.js';
import { WalletLedgerEntryEntity } from '../entities/wallet-ledger-entry.entity.js';

@Injectable()
export class WalletLedgerEntryRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async findPage(
    walletId: string,
    before: { createdAt: Date; id: string } | undefined,
    limit: number,
  ): Promise<any[]> {
    const where: any = { walletId };
    if (before) {
      where.$or = [
        { createdAt: { $lt: before.createdAt } },
        { createdAt: before.createdAt, id: { $lt: before.id } },
      ];
    }

    return this.em.find(
      WalletLedgerEntryEntity as any,
      where,
      { orderBy: { createdAt: 'DESC', id: 'DESC' }, limit } as any,
    );
  }

  async findAllByWalletId(walletId: string): Promise<any[]> {
    return this.em.find(
      WalletLedgerEntryEntity as any,
      { walletId },
      { orderBy: { createdAt: 'ASC', id: 'ASC' } } as any,
    );
  }

  async save(entry: WalletLedgerEntry): Promise<void> {
    const entity: any =
      (await this.em.findOne(WalletLedgerEntryEntity as any, {
        id: entry.id,
      })) ??
      this.em.create(WalletLedgerEntryEntity as any, {
        id: entry.id,
      } as any);

    entity.id = entry.id;
    entity.walletId = entry.walletId;
    entity.transactionId = entry.transactionId;
    entity.direction = entry.direction;
    entity.amount = entry.money.toString();
    entity.balanceBefore = entry.balanceBefore.toString();
    entity.balanceAfter = entry.balanceAfter.toString();

    this.em.persist(entity);
    await this.em.flush();
  }

  async findByTransactionId(
    transactionId: string,
  ): Promise<WalletLedgerEntry | null> {
    const entity = await this.em.findOne(WalletLedgerEntryEntity as any, {
      transactionId,
    });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  private toDomain(entity: any): WalletLedgerEntry {
    return WalletLedgerEntry.restore({
      id: entity.id,
      walletId: entity.walletId,
      transactionId: entity.transactionId,
      direction: entity.direction as LedgerDirection,
      money: Money.from({
        amount: entity.amount.toString(),
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: entity.balanceBefore.toString(),
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: entity.balanceAfter.toString(),
        currency: 'BRL',
      }),
    });
  }
}
