import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { WalletApplicationService } from '../../../application/services/wallet-application.service.js';
import { WalletRepository } from '../../../infrastructure/database/repositories/wallet.repository.js';
import { WalletLedgerEntryRepository } from '../../../infrastructure/database/repositories/wallet-ledger-entry.repository.js';
import { CreateWalletDto } from '../dtos/create-wallet.dto.js';

interface LedgerCursor {
  createdAt: Date;
  id: string;
}

@Controller('wallets')
export class WalletController {
  constructor(
    private readonly walletService: WalletApplicationService,
    private readonly wallets: WalletRepository,
    private readonly ledger: WalletLedgerEntryRepository,
  ) {}

  @Post()
  async create(@Body() dto: CreateWalletDto) {
    try {
      const wallet = await this.walletService.create({
        playerId: dto.playerId,
        initialBalance: dto.initialBalance.amount,
        currency: dto.initialBalance.currency,
      });
      return this.toWalletResponse(wallet);
    } catch (error) {
      if (error instanceof Error && error.message === 'WALLET_ALREADY_EXISTS') {
        throw new ConflictException('A wallet already exists for this player and currency');
      }
      throw error;
    }
  }

  @Get(':walletId/ledger')
  async getLedger(
    @Param('walletId', new ParseUUIDPipe()) walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitValue?: string,
  ) {
    const wallet = await this.wallets.findById(walletId);
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const limit = limitValue === undefined ? 50 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be an integer from 1 to 100');
    }

    const before = cursor ? this.decodeCursor(cursor) : undefined;
    const rows = await this.ledger.findPage(walletId, before, limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return {
      entries: page.map((entry: any) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        amount: { amount: entry.amount.toString(), currency: wallet.currency },
        balanceBefore: {
          amount: entry.balanceBefore.toString(),
          currency: wallet.currency,
        },
        balanceAfter: {
          amount: entry.balanceAfter.toString(),
          currency: wallet.currency,
        },
        createdAt: new Date(entry.createdAt).toISOString(),
      })),
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                createdAt: new Date(last.createdAt).toISOString(),
                id: last.id,
              }),
            ).toString('base64url')
          : null,
    };
  }

  @Get(':walletId/reconciliation')
  async reconcile(
    @Param('walletId', new ParseUUIDPipe()) walletId: string,
  ) {
    const wallet = await this.wallets.findById(walletId);
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return this.walletService.reconcile(wallet);
  }

  @Post(':walletId/reconciliation')
  async reconcilePost(
    @Param('walletId', new ParseUUIDPipe()) walletId: string,
  ) {
    return this.reconcile(walletId);
  }

  @Get(':walletId')
  async getById(@Param('walletId', new ParseUUIDPipe()) walletId: string) {
    const wallet = await this.wallets.findById(walletId);
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return this.toWalletResponse(wallet);
  }

  private decodeCursor(cursor: string): LedgerCursor {
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (
        typeof value.createdAt !== 'string' ||
        Number.isNaN(Date.parse(value.createdAt)) ||
        typeof value.id !== 'string'
      ) {
        throw new Error('Invalid cursor');
      }
      return { createdAt: new Date(value.createdAt), id: value.id };
    } catch {
      throw new BadRequestException('cursor is invalid');
    }
  }

  private toWalletResponse(wallet: {
    id: string;
    playerId: string;
    currency: string;
    balance: { toJSON: () => { amount: string; currency: string } };
    version: number;
  }) {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }
}
