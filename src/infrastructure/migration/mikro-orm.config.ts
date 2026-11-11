import { PostgreSqlDriver } from '@mikro-orm/postgresql';

import { WalletEntity } from '../database/entities/wallet.entity';

export default {
  driver: PostgreSqlDriver,

  host: 'localhost',
  port: 5432,

  user: 'wagering',
  password: 'wagering',
  dbName: 'wagering',

  entities: [
    WalletEntity,
  ],

  migrations: {
    path: './src/infrastructure/database/migrations',
  },
};