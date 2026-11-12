import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';

import { WagerTransactionRepository } from '../../../infrastructure/database/repositories/wager-transaction.repository.js';

@Controller()
export class WagerTransactionQueryController {
  constructor(private readonly transactions: WagerTransactionRepository) {}

  @Get('wagering/transactions/:transactionId')
  async getById(
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
  ) {
    const transaction = await this.transactions.findById(transactionId);
    if (!transaction) {
      throw new NotFoundException('Wager transaction not found');
    }
    return this.toResponse(transaction);
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  async getByProviderReference(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    const transaction = await this.transactions.findByReference(
      providerId,
      externalTransactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Wager transaction not found');
    }
    return this.toResponse(transaction);
  }

  private toResponse(transaction: Awaited<ReturnType<WagerTransactionRepository['findById']>> extends infer T ? Exclude<T, null> : never) {
    return {
      transactionId: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      idempotencyKey: transaction.idempotencyKey,
      status: transaction.status,
      failureCode: transaction.failureCode ?? null,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      money: transaction.money.toJSON(),
      referenceExternalTransactionId:
        transaction.referenceExternalTransactionId ?? null,
      referenceTransactionId: transaction.referenceTransactionId ?? null,
    };
  }
}
