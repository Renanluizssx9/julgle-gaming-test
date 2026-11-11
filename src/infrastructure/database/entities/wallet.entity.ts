import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core';

@Entity({
  tableName: 'wallets',
})
@Unique({
  properties: [
    'playerId',
    'currency',
  ],
})
export class WalletEntity {
  @PrimaryKey()
  id!: string;

  @Property()
  playerId!: string;

  @Property({
    length: 3,
  })
  currency!: string;

  @Property({
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  balance!: string;

  @Property()
  version!: number;

  @Property()
  createdAt = new Date();

  @Property({
    onUpdate: () => new Date(),
  })
  updatedAt = new Date();
}