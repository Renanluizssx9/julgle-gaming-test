import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { MikroORM, RequestContext } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import config from '../src/infrastructure/migration/mikro-orm.config.js';
import { WalletApplicationService } from '../src/application/services/wallet-application.service.js';
import { ProcessWagerTransactionService } from '../src/application/services/process-wager-transaction.service.js';
import { WagerTransactionKind } from '../src/domain/transaction/wager-transaction.js';
import { OutboxEvent, OutboxStatus } from '../src/domain/outbox/outbox-event.js';
import { InboxEntryRepository } from '../src/infrastructure/database/repositories/inbox-entry.repository.js';
import { OutboxEventRepository } from '../src/infrastructure/database/repositories/outbox-event.repository.js';
import { OutboxEventEntity } from '../src/infrastructure/database/entities/outbox-event.entity.js';
import { WalletLedgerEntryRepository } from '../src/infrastructure/database/repositories/wallet-ledger-entry.repository.js';
import { WalletRepository } from '../src/infrastructure/database/repositories/wallet.repository.js';
import { WagerTransactionRepository } from '../src/infrastructure/database/repositories/wager-transaction.repository.js';
import { SqsMessagingWorker } from '../src/infrastructure/messaging/sqs-messaging-worker.js';

const enabled = process.env.RUN_INTEGRATION_TESTS === '1';
const integration = describe.skipIf(!enabled);
const endpoint = process.env.SQS_ENDPOINT ?? 'http://localhost:4566';
let orm: MikroORM;
let sqs: SQSClient;

function forkEntityManager() {
  return orm.em.fork({ useContext: true });
}

function repositories(em: any) {
  return {
    wallet: new WalletRepository(em),
    transaction: new WagerTransactionRepository(em),
    ledger: new WalletLedgerEntryRepository(em),
    outbox: new OutboxEventRepository(em),
    inbox: new InboxEntryRepository(em),
  };
}

function serviceFor(em: any, outboxOverride?: { save: (event: any) => Promise<void> }) {
  const repos = repositories(em);
  return new ProcessWagerTransactionService(
    repos.wallet,
    repos.transaction,
    repos.ledger,
    { run: (operation) => em.transactional(() => operation()) },
    outboxOverride ?? repos.outbox,
    repos.inbox,
  );
}

function queueUrlFrom(result: string): string {
  const queueUrl = new URL(result);
  const localEndpoint = new URL(endpoint);
  queueUrl.protocol = localEndpoint.protocol;
  queueUrl.host = localEndpoint.host;
  return queueUrl.toString();
}

integration('PostgreSQL and LocalStack integration', () => {
  beforeAll(async () => {
    orm = await MikroORM.init(config);
    sqs = new SQSClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
      },
    });
  });

  afterAll(async () => {
    sqs?.destroy();
    await orm?.close(true);
  });

  it('serializes competing bets and persists exactly one debit', async () => {
    const setupEm = forkEntityManager();
    const setupRepos = repositories(setupEm);
    const wallet = await RequestContext.create(setupEm, () =>
      new WalletApplicationService(
        setupEm,
        setupRepos.wallet,
        setupRepos.transaction,
        setupRepos.ledger,
        setupRepos.outbox,
      ).create({
        playerId: crypto.randomUUID(),
        initialBalance: '100.00',
        currency: 'BRL',
      }),
    );

    const common = {
      walletId: wallet.id,
      playerId: wallet.playerId,
      providerId: `race-${crypto.randomUUID()}`,
      roundId: 'race-round',
      gameId: 'race-game',
      kind: WagerTransactionKind.Bet,
      amount: '80.00',
      currency: 'BRL',
    };
    const outcomes = await Promise.all(
      ['race-a', 'race-b'].map((externalTransactionId) => {
        const em = forkEntityManager();
        return RequestContext.create(em, () =>
          serviceFor(em).process({
            ...common,
            externalTransactionId,
            idempotencyKey: `${common.providerId}:${externalTransactionId}`,
          }),
        );
      }),
    );

    expect(outcomes.filter((result) => result.transaction.status === 'PROCESSED'))
      .toHaveLength(1);
    expect(outcomes.filter((result) => result.transaction.failureCode === 'INSUFFICIENT_FUNDS'))
      .toHaveLength(1);

    const verifyEm = forkEntityManager();
    const finalWallet = await repositories(verifyEm).wallet.findById(wallet.id);
    const entries = await repositories(verifyEm).ledger.findAllByWalletId(wallet.id);
    expect(finalWallet?.balance.toString()).toBe('20.00');
    expect(entries.filter((entry: any) => entry.direction === 'DEBIT')).toHaveLength(1);
  });

  it('resolves an out-of-order refund and rejects a second reversal', async () => {
    const setupEm = forkEntityManager();
    const setupRepos = repositories(setupEm);
    const wallet = await RequestContext.create(setupEm, () =>
      new WalletApplicationService(
        setupEm,
        setupRepos.wallet,
        setupRepos.transaction,
        setupRepos.ledger,
        setupRepos.outbox,
      ).create({
        playerId: crypto.randomUUID(),
        initialBalance: '100.00',
        currency: 'BRL',
      }),
    );
    const providerId = `reference-${crypto.randomUUID()}`;
    const referenceExternalTransactionId = 'bet-after-refund';
    const refundInput = {
      walletId: wallet.id,
      playerId: wallet.playerId,
      providerId,
      externalTransactionId: 'refund-before-bet',
      idempotencyKey: `${providerId}:refund-before-bet`,
      roundId: 'reference-round',
      gameId: 'reference-game',
      kind: WagerTransactionKind.Refund,
      amount: '10.00',
      currency: 'BRL',
      referenceExternalTransactionId,
    };
    const refundEm = forkEntityManager();
    const pending = await RequestContext.create(refundEm, () =>
      serviceFor(refundEm).process(refundInput),
    );
    expect(pending.transaction.status).toBe('PENDING_REFERENCE');

    const betInput = {
      ...refundInput,
      externalTransactionId: referenceExternalTransactionId,
      idempotencyKey: `${providerId}:${referenceExternalTransactionId}`,
      kind: WagerTransactionKind.Bet,
      amount: '10.00',
      referenceExternalTransactionId: undefined,
    };
    const betEm = forkEntityManager();
    const bet = await RequestContext.create(betEm, () =>
      serviceFor(betEm).process(betInput),
    );
    expect(bet.wallet.balance.toString()).toBe('90.00');

    const retryEm = forkEntityManager();
    await RequestContext.create(retryEm, () =>
      serviceFor(retryEm).processPendingReferences(100, new Date(Date.now() + 60_000)),
    );

    const secondRefundEm = forkEntityManager();
    const secondRefund = await RequestContext.create(secondRefundEm, () =>
      serviceFor(secondRefundEm).process({
        ...refundInput,
        externalTransactionId: 'refund-second-attempt',
        idempotencyKey: `${providerId}:refund-second-attempt`,
      }),
    );

    const verifyEm = forkEntityManager();
    const verifyRepos = repositories(verifyEm);
    const finalWallet = await verifyRepos.wallet.findById(wallet.id);
    const refund = await verifyRepos.transaction.findByReference(
      providerId,
      refundInput.externalTransactionId,
    );
    const entries = await verifyRepos.ledger.findAllByWalletId(wallet.id);

    expect(refund?.status).toBe('PROCESSED');
    expect(finalWallet?.balance.toString()).toBe('100.00');
    expect(secondRefund.transaction.failureCode).toBe('ALREADY_REVERSED');
    expect(entries.filter((entry: any) => entry.direction === 'DEBIT'))
      .toHaveLength(1);
    expect(entries.filter((entry: any) => entry.direction === 'CREDIT'))
      .toHaveLength(2);
  });

  it('deduplicates fifty concurrent deliveries of one idempotency key', async () => {
    const setupEm = forkEntityManager();
    const setupRepos = repositories(setupEm);
    const wallet = await RequestContext.create(setupEm, () =>
      new WalletApplicationService(
        setupEm,
        setupRepos.wallet,
        setupRepos.transaction,
        setupRepos.ledger,
        setupRepos.outbox,
      ).create({
        playerId: crypto.randomUUID(),
        initialBalance: '100.00',
        currency: 'BRL',
      }),
    );
    const providerId = `parallel-${crypto.randomUUID()}`;
    const input = {
      walletId: wallet.id,
      playerId: wallet.playerId,
      providerId,
      externalTransactionId: 'same-transaction',
      idempotencyKey: `${providerId}:same-transaction`,
      roundId: 'parallel-round',
      gameId: 'parallel-game',
      kind: WagerTransactionKind.Bet,
      amount: '1.00',
      currency: 'BRL',
    };

    const results = await Promise.all(
      Array.from({ length: 50 }, () => {
        const em = forkEntityManager();
        return RequestContext.create(em, () => serviceFor(em).process(input));
      }),
    );

    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(results.filter((result) => result.duplicate)).toHaveLength(49);
    const verifyEm = forkEntityManager();
    const finalWallet = await repositories(verifyEm).wallet.findById(wallet.id);
    const transaction = await repositories(verifyEm).transaction.findByReference(
      providerId,
      input.externalTransactionId,
    );
    const entries = await repositories(verifyEm).ledger.findAllByWalletId(wallet.id);
    expect(finalWallet?.balance.toString()).toBe('99.00');
    expect(transaction).not.toBeNull();
    expect(entries.filter((entry: any) => entry.transactionId === transaction?.id))
      .toHaveLength(1);
  });

  it('keeps the same-wallet race correct across three Bun processes', async () => {
    const setupEm = forkEntityManager();
    const setupRepos = repositories(setupEm);
    const wallet = await RequestContext.create(setupEm, () =>
      new WalletApplicationService(
        setupEm,
        setupRepos.wallet,
        setupRepos.transaction,
        setupRepos.ledger,
        setupRepos.outbox,
      ).create({
        playerId: crypto.randomUUID(),
        initialBalance: '100.00',
        currency: 'BRL',
      }),
    );
    const providerId = `multi-process-${crypto.randomUUID()}`;
    const inputs = ['process-a', 'process-b', 'process-c'].map((externalTransactionId) => ({
      walletId: wallet.id,
      playerId: wallet.playerId,
      providerId,
      externalTransactionId,
      idempotencyKey: `${providerId}:${externalTransactionId}`,
      roundId: 'multi-process-round',
      gameId: 'multi-process-game',
      kind: WagerTransactionKind.Bet,
      amount: '80.00',
      currency: 'BRL',
    }));

    const outcomes = await Promise.all(inputs.map(async (input) => {
      const child = Bun.spawn({
        cmd: ['bun', 'scripts/process-wager-once.mjs', JSON.stringify(input)],
        env: process.env,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (exitCode !== 0) {
        throw new Error(`Concurrent Bun worker failed: ${stderr}`);
      }
      return JSON.parse(stdout);
    }));

    expect(outcomes.filter((result) => result.status === 'PROCESSED'))
      .toHaveLength(1);
    expect(outcomes.filter((result) => result.failureCode === 'INSUFFICIENT_FUNDS'))
      .toHaveLength(2);

    const verifyEm = forkEntityManager();
    const verifyRepos = repositories(verifyEm);
    expect((await verifyRepos.wallet.findById(wallet.id))?.balance.toString())
      .toBe('20.00');
    const entries = await verifyRepos.ledger.findAllByWalletId(wallet.id);
    expect(entries.filter((entry: any) => entry.direction === 'DEBIT'))
      .toHaveLength(1);
  });

  it('rolls back wallet, transaction, and ledger if outbox persistence fails', async () => {
    const setupEm = forkEntityManager();
    const setupRepos = repositories(setupEm);
    const wallet = await RequestContext.create(setupEm, () =>
      new WalletApplicationService(
        setupEm,
        setupRepos.wallet,
        setupRepos.transaction,
        setupRepos.ledger,
        setupRepos.outbox,
      ).create({
        playerId: crypto.randomUUID(),
        initialBalance: '10.00',
        currency: 'BRL',
      }),
    );
    const providerId = `rollback-${crypto.randomUUID()}`;
    const input = {
      walletId: wallet.id,
      playerId: wallet.playerId,
      providerId,
      externalTransactionId: 'atomic-failure',
      idempotencyKey: `${providerId}:atomic-failure`,
      roundId: 'atomic-round',
      gameId: 'atomic-game',
      kind: WagerTransactionKind.Bet,
      amount: '2.00',
      currency: 'BRL',
    };

    const requestEm = forkEntityManager();
    await expect(
      RequestContext.create(requestEm, () =>
        serviceFor(requestEm, {
          save: async () => {
            throw new Error('injected outbox failure');
          },
        }).process(input),
      ),
    ).rejects.toThrow('injected outbox failure');

    const verifyEm = forkEntityManager();
    const verifyRepos = repositories(verifyEm);
    expect((await verifyRepos.wallet.findById(wallet.id))?.balance.toString())
      .toBe('10.00');
    expect(await verifyRepos.transaction.findByReference(providerId, input.externalTransactionId))
      .toBeNull();
    expect(await verifyRepos.ledger.findAllByWalletId(wallet.id))
      .toHaveLength(1);
  });

  it('processes a LocalStack Inbox delivery once and deduplicates redelivery', async () => {
    const queueName = `integration-inbox-${crypto.randomUUID()}`;
    const created = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    const queueUrl = queueUrlFrom(created.QueueUrl!);
    const setupEm = forkEntityManager();
    const setupRepos = repositories(setupEm);
    const wallet = await RequestContext.create(setupEm, () =>
      new WalletApplicationService(
        setupEm,
        setupRepos.wallet,
        setupRepos.transaction,
        setupRepos.ledger,
        setupRepos.outbox,
      ).create({
        playerId: crypto.randomUUID(),
        initialBalance: '0.00',
        currency: 'BRL',
      }),
    );
    const providerId = `inbox-${crypto.randomUUID()}`;
    const envelope = {
      messageId: crypto.randomUUID(),
      type: 'WagerTransactionRequested',
      occurredAt: new Date().toISOString(),
      data: {
        providerId,
        externalTransactionId: 'message-bet',
        idempotencyKey: `${providerId}:message-bet`,
        playerId: wallet.playerId,
        walletId: wallet.id,
        roundId: 'inbox-round',
        gameId: 'inbox-game',
        kind: 'WIN',
        money: { amount: '7.50', currency: 'BRL' },
      },
    };
    const body = JSON.stringify(envelope);

    try {
      await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }));
      const em = forkEntityManager();
      const repos = repositories(em);
      const worker = new SqsMessagingWorker(
        sqs,
        repos.outbox,
        { inboxQueueUrl: queueUrl },
        em,
        serviceFor(em),
      );
      await RequestContext.create(em, () => worker.consumeInboxOnce());

      const verifyEm = forkEntityManager();
      const verifyRepos = repositories(verifyEm);
      const inboxEntry = await verifyRepos.inbox.findByMessageId(envelope.messageId);
      expect(inboxEntry?.status).toBe('PROCESSED');
      expect((await verifyRepos.wallet.findById(wallet.id))?.balance.toString())
        .toBe('7.50');

      await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }));
      await RequestContext.create(em, () => worker.consumeInboxOnce());
      const afterRedelivery = forkEntityManager();
      const afterRepos = repositories(afterRedelivery);
      expect((await afterRepos.wallet.findById(wallet.id))?.balance.toString())
        .toBe('7.50');
      expect(await afterRepos.transaction.findByReference(providerId, 'message-bet'))
        .not.toBeNull();
      expect(await afterRepos.ledger.findAllByWalletId(wallet.id))
        .toHaveLength(1);
    } finally {
      await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
    }
  });

  it('publishes a committed Outbox event to a real LocalStack queue', async () => {
    const queueName = `integration-outbox-${crypto.randomUUID()}`;
    const created = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    const queueUrl = queueUrlFrom(created.QueueUrl!);
    const setupEm = forkEntityManager();
    const outbox = repositories(setupEm).outbox;
    const event = OutboxEvent.create({
      id: crypto.randomUUID(),
      aggregateType: 'IntegrationTest',
      aggregateId: crypto.randomUUID(),
      type: 'INTEGRATION_TEST_EVENT',
      payload: { check: 'outbox-publication' },
    });

    try {
      await RequestContext.create(setupEm, () => outbox.save(event));

      const emA = forkEntityManager();
      const emB = forkEntityManager();
      const workerA = new SqsMessagingWorker(
        sqs,
        repositories(emA).outbox,
        { outboxQueueUrl: queueUrl },
        emA,
        serviceFor(emA),
      );
      const workerB = new SqsMessagingWorker(
        sqs,
        repositories(emB).outbox,
        { outboxQueueUrl: queueUrl },
        emB,
        serviceFor(emB),
      );

      for (let attempt = 0; attempt < 5; attempt++) {
        await Promise.all([
          RequestContext.create(emA, () => workerA.publishPendingOutbox()),
          RequestContext.create(emB, () => workerB.publishPendingOutbox()),
        ]);
        const statusEm = forkEntityManager();
        const persisted: any = await statusEm.findOne(OutboxEventEntity as any, {
          id: event.id,
        });
        if (persisted?.status === OutboxStatus.Published) {
          break;
        }
      }

      const persistedEm = forkEntityManager();
      const persisted: any = await persistedEm.findOne(
        OutboxEventEntity as any,
        { id: event.id },
      );
      const attributes = await sqs.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ['ApproximateNumberOfMessages'],
        }),
      );
      let publishedEnvelope: any;
      for (let attempt = 0; attempt < 10 && !publishedEnvelope; attempt++) {
        const messages = await sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 0,
          }),
        );
        for (const message of messages.Messages ?? []) {
          if (!message.Body) {
            continue;
          }
          const envelope = JSON.parse(message.Body);
          if (envelope.eventId === event.id) {
            publishedEnvelope = envelope;
            break;
          }
        }
      }

      expect(persisted?.status).toBe(OutboxStatus.Published);
      expect(Number(attributes.Attributes?.ApproximateNumberOfMessages))
        .toBeGreaterThan(0);
      expect(publishedEnvelope).toMatchObject({
        eventId: event.id,
        eventType: 'INTEGRATION_TEST_EVENT',
        aggregateId: event.aggregateId,
        correlationId: event.aggregateId,
        version: 1,
        data: { check: 'outbox-publication' },
      });
    } finally {
      await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
    }
  });

  it('persists Outbox retry state when LocalStack rejects publication', async () => {
    const em = forkEntityManager();
    const outbox = repositories(em).outbox;
    const event = OutboxEvent.create({
      id: crypto.randomUUID(),
      aggregateType: 'IntegrationTest',
      aggregateId: crypto.randomUUID(),
      type: 'INTEGRATION_TEST_RETRY',
      payload: { check: 'outbox-retry' },
    });
    await RequestContext.create(em, () => outbox.save(event));

    const worker = new SqsMessagingWorker(
      sqs,
      outbox,
      {
        outboxQueueUrl:
          `http://localhost:4566/queue/us-east-1/000000000000/missing-${crypto.randomUUID()}`,
      },
      em,
      serviceFor(em),
    );

    await RequestContext.create(em, () => worker.publishPendingOutbox());

    const verifyEm = forkEntityManager();
    const persisted = await repositories(verifyEm).outbox.findById(event.id);
    expect(persisted?.status).toBe(OutboxStatus.Pending);
    expect(persisted?.attempts).toBe(1);
    expect(persisted?.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
  });
});
