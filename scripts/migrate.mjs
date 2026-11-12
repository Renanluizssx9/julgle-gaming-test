import { fileURLToPath } from 'node:url';

import { MikroORM } from '@mikro-orm/postgresql';

import config from '../dist/infrastructure/migration/mikro-orm.config.js';

const migrationsPath = fileURLToPath(
  new URL('../dist/infrastructure/database/migrations', import.meta.url),
);

const orm = await MikroORM.init({
  ...config,
  migrations: {
    ...config.migrations,
    path: migrationsPath,
    pathTs: migrationsPath,
  },
});

try {
  const applied = await orm.migrator.up();
  if (applied.length === 0) {
    console.log('No pending migrations.');
  } else {
    console.log(`Applied ${applied.length} migration(s):`);
    for (const migration of applied) {
      console.log(`- ${migration.name}`);
    }
  }
} finally {
  await orm.close(true);
}
