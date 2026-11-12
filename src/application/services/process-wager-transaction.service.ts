import { ProcessBetUseCase } from '../use-cases/process-bet.use-case.js';
import { ProcessLossUseCase } from '../use-cases/process-loss.use-case.js';
import { ProcessRefundUseCase } from '../use-cases/process-refund.use-case.js';
import { ProcessRollbackUseCase } from '../use-cases/process-rollback.use-case.js';
import { ProcessWinUseCase } from '../use-cases/process-win.use-case.js';
import { IdempotencyConflictError } from '../errors/idempotency-conflict.error.js';
import { InboxEntry, InboxStatus } from '../../domain/inbox/inbox-entry.js';
import { Money } from '../../domain/shared/money.js';
import { OutboxEvent } from '../../domain/outbox/outbox-event.js';
import { WagerTransaction, WagerTransactionKind } from '../../domain/transaction/wager-transaction.js';
import { Wallet } from '../../domain/wallet/wallet.js';
import { hashWagerPayload } from './wager-payload-hash.js';
import { WagerMetrics } from '../observability/wager-metrics.js';

interface ProcessWagerTransactionInput {
  walletId: string;
  playerId: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey?: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  amount: string;
  currency: string;
  referenceExternalTransactionId?: string;
}

interface TransactionRunner {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

interface OutboxRepository {
  save(event: OutboxEvent): Promise<void>;
}

interface InboxRepository {
  lockMessageId(messageId: string, consumerName: string): Promise<void>;
  findByMessageId(
    messageId: string,
    consumerName: string,
  ): Promise<InboxEntry | null>;
  save(entry: InboxEntry): Promise<void>;
}

interface ProcessWagerTransactionResult {
  wallet: Wallet;
  transaction: WagerTransaction;
  ledger: unknown;
  duplicate: boolean;
}

export class ProcessWagerTransactionService {
  constructor(
    private readonly walletRepository: {
      lockForUpdate: (playerId: string, currency: string) => Promise<void>;
      findByPlayerIdAndCurrency: (
        playerId: string,
        currency: string,
      ) => Promise<Wallet | null>;
      save: (wallet: Wallet) => Promise<void>;
    },
    private readonly wagerTransactionRepository: {
      lockDeduplicationKey: (
        providerId: string,
        externalTransactionId: string,
        idempotencyKey: string,
      ) => Promise<void>;
      findByIdempotencyKey: (
        idempotencyKey: string,
      ) => Promise<WagerTransaction | null>;
      findByReference: (
        providerId: string,
        externalTransactionId: string,
      ) => Promise<WagerTransaction | null>;
      findReversal: (
        referenceTransactionId: string,
        kind: WagerTransactionKind,
      ) => Promise<WagerTransaction | null>;
      lockReversal: (
        referenceTransactionId: string,
        kind: WagerTransactionKind,
      ) => Promise<void>;
      findPendingReferences: (
        limit?: number,
        now?: Date,
      ) => Promise<WagerTransaction[]>;
      findByDeduplicationKey: (
        providerId: string,
        externalTransactionId: string,
      ) => Promise<WagerTransaction | null>;
      save: (transaction: WagerTransaction) => Promise<void>;
    },
    private readonly walletLedgerEntryRepository: {
      save: (entry: any) => Promise<void>;
    },
    private readonly transactionRunner: TransactionRunner = {
      run: (operation) => operation(),
    },
    private readonly outboxRepository: OutboxRepository = {
      save: async () => undefined,
    },
    private readonly inboxRepository: InboxRepository = {
      lockMessageId: async () => undefined,
      findByMessageId: async () => null,
      save: async () => undefined,
    },
    private readonly metrics = new WagerMetrics(),
  ) {}

  async process(
    input: ProcessWagerTransactionInput,
  ): Promise<ProcessWagerTransactionResult> {
    const startedAt = performance.now();
    try {
      const result = await this.transactionRunner.run(() =>
        this.processWithinTransaction(input),
      );
      this.metrics.recordTransaction(result.transaction.status);
      if (result.duplicate) {
        this.metrics.recordDuplicate();
      }
      return result;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === '40P01' || code === '55P03') {
        this.metrics.recordLockConflict();
      }
      throw error;
    } finally {
      this.metrics.recordProcessingDuration(performance.now() - startedAt);
    }
  }

  async processFromInbox(
    input: ProcessWagerTransactionInput,
    message: {
      messageId: string;
      type: string;
      payloadHash: string;
      payload: unknown;
    },
  ): Promise<void> {
    await this.transactionRunner.run(async () => {
      const consumerName = 'wager-processor';
      await this.inboxRepository.lockMessageId(
        message.messageId,
        consumerName,
      );

      const existing = await this.inboxRepository.findByMessageId(
        message.messageId,
        consumerName,
      );

      if (existing?.payloadHash && existing.payloadHash !== message.payloadHash) {
        throw new IdempotencyConflictError();
      }

      if (existing?.status === InboxStatus.Processed) {
        this.metrics.recordDuplicate();
        return;
      }

      const inboxEntry =
        existing ??
        InboxEntry.create({
          id: crypto.randomUUID(),
          messageId: message.messageId,
          consumerName,
          payloadHash: message.payloadHash,
          type: message.type,
          payload: message.payload,
        });

      await this.inboxRepository.save(inboxEntry);
      const startedAt = performance.now();
      const result = await this.processWithinTransaction(input);
      this.metrics.recordTransaction(result.transaction.status);
      this.metrics.recordProcessingDuration(performance.now() - startedAt);
      inboxEntry.markProcessed();
      await this.inboxRepository.save(inboxEntry);
    });
  }

  async processPendingReferences(
    limit = 100,
    now = new Date(),
  ): Promise<void> {
    const pendingTransactions =
      await this.wagerTransactionRepository.findPendingReferences(limit, now);

    for (const pending of pendingTransactions) {
      await this.transactionRunner.run(async () => {
        await this.wagerTransactionRepository.lockDeduplicationKey(
          pending.providerId,
          pending.externalTransactionId,
          pending.idempotencyKey,
        );

        const transaction = await this.wagerTransactionRepository.findByDeduplicationKey(
          pending.providerId,
          pending.externalTransactionId,
        );
        if (
          !transaction ||
          transaction.status !== 'PENDING_REFERENCE' ||
          !transaction.referenceExternalTransactionId
        ) {
          return;
        }

        await this.walletRepository.lockForUpdate(
          transaction.playerId,
          transaction.money.currency,
        );
        const wallet = await this.walletRepository.findByPlayerIdAndCurrency(
          transaction.playerId,
          transaction.money.currency,
        );
        if (!wallet) {
          transaction.reject('INVALID_REFERENCE');
          await this.wagerTransactionRepository.save(transaction);
          await this.saveReversalOutbox(
            transaction,
            undefined,
            Wallet.open({
              id: transaction.walletId,
              playerId: transaction.playerId,
              initialBalance: Money.zero(transaction.money.currency),
            }),
          );
          return;
        }

        const reference = await this.wagerTransactionRepository.findByReference(
          transaction.providerId,
          transaction.referenceExternalTransactionId,
        );
        if (!reference) {
          const retryScheduled = transaction.scheduleReferenceRetry();
          if (retryScheduled) this.metrics.recordRetry();
          await this.wagerTransactionRepository.save(transaction);
          if (!retryScheduled) {
            await this.saveReversalOutbox(transaction, undefined, wallet);
          }
          return;
        }

        if (reference.status !== 'PROCESSED') {
          if (reference.isTerminal()) {
            transaction.reject('INVALID_REFERENCE');
            await this.wagerTransactionRepository.save(transaction);
            await this.saveReversalOutbox(transaction, reference, wallet);
            return;
          }

          const retryScheduled = transaction.scheduleReferenceRetry();
          if (retryScheduled) this.metrics.recordRetry();
          await this.wagerTransactionRepository.save(transaction);
          if (!retryScheduled) {
            await this.saveReversalOutbox(transaction, reference, wallet);
          }
          return;
        }

        const referenceIsCompatible =
          reference.status === 'PROCESSED' &&
          reference.playerId === transaction.playerId &&
          reference.walletId === transaction.walletId &&
          reference.roundId === transaction.roundId &&
          reference.money.currency === transaction.money.currency &&
          reference.money.equals(transaction.money) &&
          (transaction.kind === WagerTransactionKind.Refund
            ? reference.kind === WagerTransactionKind.Bet
            : [
                WagerTransactionKind.Bet,
                WagerTransactionKind.Win,
                WagerTransactionKind.Loss,
              ].includes(reference.kind));

        await this.wagerTransactionRepository.lockReversal(
          reference.id,
          transaction.kind,
        );
        const existingReversal = await this.wagerTransactionRepository.findReversal(
          reference.id,
          transaction.kind,
        );

        let result;
        if (!referenceIsCompatible || existingReversal) {
          transaction.reject(
            existingReversal ? 'ALREADY_REVERSED' : 'INVALID_REFERENCE',
          );
          result = { wallet, transaction, ledger: undefined };
        } else if (transaction.kind === WagerTransactionKind.Refund) {
          result = new ProcessRefundUseCase().execute({
            wallet,
            transaction,
            reference,
          });
        } else if (transaction.kind === WagerTransactionKind.Rollback) {
          result = new ProcessRollbackUseCase().execute({
            wallet,
            transaction,
            reference,
          });
        } else {
          transaction.reject('INVALID_REFERENCE');
          result = { wallet, transaction, ledger: undefined };
        }

        if (result.ledger) {
          await this.walletRepository.save(result.wallet);
          await this.walletLedgerEntryRepository.save(result.ledger);
        }
        await this.wagerTransactionRepository.save(result.transaction);
        await this.saveReversalOutbox(
          result.transaction,
          reference,
          result.wallet,
          result.ledger,
        );
      });
    }
  }
  private async processWithinTransaction(
    input: ProcessWagerTransactionInput,
  ): Promise<ProcessWagerTransactionResult> {
    const idempotencyKey =
      input.idempotencyKey ??
      `${input.providerId}:${input.externalTransactionId}`;
    const payloadHash = hashWagerPayload(input);

    await this.wagerTransactionRepository.lockDeduplicationKey(
      input.providerId,
      input.externalTransactionId,
      idempotencyKey,
    );

    const existingByKey =
      await this.wagerTransactionRepository.findByIdempotencyKey(
        idempotencyKey,
      );
    const existingTransaction = existingByKey ??
      await this.wagerTransactionRepository.findByDeduplicationKey(
        input.providerId,
        input.externalTransactionId,
      );

    if (existingTransaction) {
      const existingPayloadHash =
        existingTransaction.payloadHash ??
        hashWagerPayload({
          providerId: existingTransaction.providerId,
          externalTransactionId:
            existingTransaction.externalTransactionId,
          walletId: existingTransaction.walletId,
          playerId: existingTransaction.playerId,
          roundId: existingTransaction.roundId,
          gameId: existingTransaction.gameId,
          kind: existingTransaction.kind,
          amount: existingTransaction.money.toString(),
          currency: existingTransaction.money.currency,
          referenceExternalTransactionId:
            existingTransaction.referenceExternalTransactionId,
        });

      if (
        existingTransaction.idempotencyKey !== idempotencyKey ||
        existingPayloadHash !== payloadHash
      ) {
        throw new IdempotencyConflictError();
      }

      const wallet =
        await this.walletRepository.findByPlayerIdAndCurrency(
          input.playerId,
          input.currency,
        );

      return {
        wallet: wallet ?? Wallet.open({
          id: input.walletId,
          playerId: input.playerId,
          initialBalance: Money.zero(input.currency),
        }),
        transaction: existingTransaction,
        ledger: undefined,
        duplicate: true,
      };
    }

    await this.walletRepository.lockForUpdate(
      input.playerId,
      input.currency,
    );

    const wallet =
      (await this.walletRepository.findByPlayerIdAndCurrency(
        input.playerId,
        input.currency,
      )) ??
      Wallet.open({
        id: input.walletId,
        playerId: input.playerId,
        initialBalance: Money.zero(input.currency),
      });

    const transaction = WagerTransaction.create({
      id: crypto.randomUUID(),
      providerId: input.providerId,
      externalTransactionId: input.externalTransactionId,
      idempotencyKey,
      payloadHash,
      walletId: wallet.id,
      playerId: input.playerId,
      roundId: input.roundId,
      gameId: input.gameId,
      kind: input.kind,
      money: Money.from({
        amount: input.amount,
        currency: input.currency,
      }),
      referenceExternalTransactionId:
        input.referenceExternalTransactionId,
    });

    let result;

    if (
      input.kind === WagerTransactionKind.Refund ||
      input.kind === WagerTransactionKind.Rollback
    ) {
      const reference = await this.wagerTransactionRepository.findByReference(
        input.providerId,
        input.referenceExternalTransactionId!,
      );

      if (!reference) {
        if (transaction.scheduleReferenceRetry()) {
          this.metrics.recordRetry();
        }
        await this.wagerTransactionRepository.save(transaction);
        await this.saveReversalOutbox(transaction, undefined, wallet);
        return { wallet, transaction, ledger: undefined, duplicate: false };
      }

      if (reference.status !== 'PROCESSED') {
        if (reference.isTerminal()) {
          transaction.reject('INVALID_REFERENCE');
          result = { wallet, transaction, ledger: undefined };
        } else {
          if (transaction.scheduleReferenceRetry()) {
            this.metrics.recordRetry();
          }
          await this.wagerTransactionRepository.save(transaction);
          await this.saveReversalOutbox(transaction, reference, wallet);
          return { wallet, transaction, ledger: undefined, duplicate: false };
        }
      } else {

      const referenceIsCompatible =
        reference.status === 'PROCESSED' &&
        reference.playerId === transaction.playerId &&
        reference.walletId === transaction.walletId &&
        reference.roundId === transaction.roundId &&
        reference.money.currency === transaction.money.currency &&
        reference.money.equals(transaction.money) &&
        (input.kind === WagerTransactionKind.Refund
          ? reference.kind === WagerTransactionKind.Bet
          : [
              WagerTransactionKind.Bet,
              WagerTransactionKind.Win,
              WagerTransactionKind.Loss,
            ].includes(reference.kind));

      await this.wagerTransactionRepository.lockReversal(
        reference.id,
        input.kind,
      );
      const existingReversal = await this.wagerTransactionRepository.findReversal(
        reference.id,
        input.kind,
      );

      if (!referenceIsCompatible || existingReversal) {
        transaction.reject(
          existingReversal ? 'ALREADY_REVERSED' : 'INVALID_REFERENCE',
        );
        result = { wallet, transaction, ledger: undefined };
      } else if (input.kind === WagerTransactionKind.Refund) {
        result = new ProcessRefundUseCase().execute({
          wallet,
          transaction,
          reference,
        });
      } else {
        result = new ProcessRollbackUseCase().execute({
          wallet,
          transaction,
          reference,
        });
      }
      }
    } else {
      result = this.getUseCase(input.kind).execute({
        wallet,
        transaction,
      });
    }

    await this.walletRepository.save(result.wallet);
    await this.wagerTransactionRepository.save(
      result.transaction,
    );

    if (result.ledger) {
      await this.walletLedgerEntryRepository.save(
        result.ledger,
      );
    }

    await this.outboxRepository.save(
      OutboxEvent.create({
        id: crypto.randomUUID(),
        aggregateType: 'WagerTransaction',
        aggregateId: result.transaction.id,
        type: result.transaction.status === 'PROCESSED'
          ? 'WAGER_TRANSACTION_PROCESSED'
          : 'WAGER_TRANSACTION_REJECTED',
        payload: {
          transactionId: result.transaction.id,
          providerId: result.transaction.providerId,
          externalTransactionId:
            result.transaction.externalTransactionId,
          playerId: result.transaction.playerId,
          walletId: result.wallet.id,
          kind: result.transaction.kind,
          status: result.transaction.status,
          failureCode: result.transaction.failureCode ?? null,
          amount: result.transaction.money.toString(),
          currency: result.transaction.money.currency,
          balance: result.wallet.balance.toString(),
          walletVersion: result.wallet.version,
          ledgerId: result.ledger?.id ?? null,
        },
      }),
    );

    return {
      wallet: result.wallet,
      transaction: result.transaction,
      ledger: result.ledger,
      duplicate: false,
    };
  }

  private async saveReversalOutbox(
    transaction: WagerTransaction,
    reference: WagerTransaction | undefined,
    wallet: Wallet,
    ledger?: { id: string },
  ): Promise<void> {
    const type = transaction.status === 'PROCESSED'
      ? 'WAGER_TRANSACTION_PROCESSED'
      : transaction.status === 'REJECTED'
        ? 'WAGER_TRANSACTION_REJECTED'
        : 'WAGER_TRANSACTION_PENDING_REFERENCE';

    await this.outboxRepository.save(
      OutboxEvent.create({
        id: crypto.randomUUID(),
        aggregateType: 'WagerTransaction',
        aggregateId: transaction.id,
        type,
        payload: {
          transactionId: transaction.id,
          providerId: transaction.providerId,
          externalTransactionId: transaction.externalTransactionId,
          status: transaction.status,
          failureCode: transaction.failureCode ?? null,
          referenceExternalTransactionId:
            transaction.referenceExternalTransactionId,
          referenceTransactionId: reference?.id ?? null,
          balance: wallet.balance.toString(),
          ledgerId: ledger?.id ?? null,
        },
      }),
    );
  }

  private getUseCase(kind: WagerTransactionKind) {
    switch (kind) {
      case WagerTransactionKind.Bet:
        return new ProcessBetUseCase();
      case WagerTransactionKind.Win:
        return new ProcessWinUseCase();
      case WagerTransactionKind.Loss:
        return new ProcessLossUseCase();
      case WagerTransactionKind.Refund:
      case WagerTransactionKind.Rollback:
        throw new Error('Reversal kinds require a reference transaction');
      default:
        throw new Error(`Unsupported wager kind: ${kind}`);
    }
  }
}
