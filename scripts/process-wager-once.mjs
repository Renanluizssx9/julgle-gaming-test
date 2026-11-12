import { MikroORM, RequestContext } from '@mikro-orm/postgresql';

import config from '../dist/infrastructure/migration/mikro-orm.config.js';
import { ProcessWagerTransactionService } from '../dist/application/services/process-wager-transaction.service.js';
import { InboxEntryRepository } from '../dist/infrastructure/database/repositories/inbox-entry.repository.js';
import { OutboxEventRepository } from '../dist/infrastructure/database/repositories/outbox-event.repository.js';
import { WalletLedgerEntryRepository } from '../dist/infrastructure/database/repositories/wallet-ledger-entry.repository.js';
import { WalletRepository } from '../dist/infrastructure/database/repositories/wallet.repository.js';
import { WagerTransactionRepository } from '../dist/infrastructure/database/repositories/wager-transaction.repository.js';

const input = JSON.parse(process.argv[2]);
const orm = await MikroORM.init(config);
const em = orm.em.fork({ useContext: true });

try {
  const service = new ProcessWagerTransactionService(
    new WalletRepository(em),
    new WagerTransactionRepository(em),
    new WalletLedgerEntryRepository(em),
    { run: (operation) => em.transactional(() => operation()) },
    new OutboxEventRepository(em),
    new InboxEntryRepository(em),
  );
  const result = await RequestContext.create(em, () => service.process(input));
  console.log(JSON.stringify({
    status: result.transaction.status,
    failureCode: result.transaction.failureCode ?? null,
    duplicate: result.duplicate,
    balance: result.wallet.balance.toString(),
  }));
} finally {
  await orm.close(true);
}
