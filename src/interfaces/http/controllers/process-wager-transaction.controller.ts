import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { IdempotencyConflictError } from '../../../application/errors/idempotency-conflict.error.js';
import { ProcessWagerTransactionService } from '../../../application/services/process-wager-transaction.service.js';
import { ProcessWagerTransactionDto } from '../dtos/process-wager-transaction.dto.js';

@Controller()
export class ProcessWagerTransactionController {
  constructor(
    private readonly processWagerTransactionService: ProcessWagerTransactionService,
  ) {}

  @Post('transactions/process')
  async process(
    @Body() dto: ProcessWagerTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 512) {
      throw new BadRequestException(
        'Idempotency-Key header is required and must be at most 512 characters',
      );
    }

    const amount = dto.money?.amount ?? dto.amount;
    const currency = dto.money?.currency ?? dto.currency;
    if (!amount || !currency) {
      throw new BadRequestException(
        'money.amount and money.currency are required',
      );
    }
    if (
      dto.money &&
      ((dto.amount && dto.amount !== dto.money.amount) ||
        (dto.currency && dto.currency !== dto.money.currency))
    ) {
      throw new BadRequestException('money conflicts with legacy amount/currency fields');
    }

    let result;
    try {
      result = await this.processWagerTransactionService.process({
        walletId: dto.walletId,
        playerId: dto.playerId,
        providerId: dto.providerId,
        externalTransactionId: dto.externalTransactionId,
        idempotencyKey: idempotencyKey.trim(),
        roundId: dto.roundId,
        gameId: dto.gameId,
        kind: dto.kind,
        amount,
        currency,
        referenceExternalTransactionId:
          dto.referenceExternalTransactionId,
      });
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    if (result.transaction.status === 'PENDING_REFERENCE') {
      throw new HttpException(
        {
          transactionId: result.transaction.id,
          status: result.transaction.status,
          referenceExternalTransactionId:
            result.transaction.referenceExternalTransactionId,
          idempotentReplay: result.duplicate,
        },
        HttpStatus.ACCEPTED,
      );
    }

    if (result.transaction.status === 'REJECTED') {
      throw new HttpException(
        {
          transactionId: result.transaction.id,
          status: result.transaction.status,
          failureCode: result.transaction.failureCode,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return {
      duplicate: result.duplicate,
      idempotentReplay: result.duplicate,
      balance: result.wallet.balance.toJSON(),
      transaction: {
        id: result.transaction.id,
        status: result.transaction.status,
        kind: result.transaction.kind,
        providerId: result.transaction.providerId,
        externalTransactionId: result.transaction.externalTransactionId,
      },
      wallet: {
        id: result.wallet.id,
        playerId: result.wallet.playerId,
        balance: result.wallet.balance.toString(),
        version: result.wallet.version,
      },
      ledger: result.ledger ?? null,
    };
  }

  @Post('wagering/transactions')
  async submit(
    @Body() dto: ProcessWagerTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.process(dto, idempotencyKey);
  }
}
