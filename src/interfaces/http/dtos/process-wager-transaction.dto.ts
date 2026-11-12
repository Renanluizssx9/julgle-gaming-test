import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { WagerTransactionKind } from '../../../domain/transaction/wager-transaction.js';

class MoneyDto {
  @IsString()
  @Matches(/^(?=.*[1-9])\d+\.\d{2}$/)
  amount!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export class ProcessWagerTransactionDto {
  @IsUUID()
  walletId!: string;

  @IsUUID()
  playerId!: string;

  @IsString()
  @Length(1, 100)
  providerId!: string;

  @IsString()
  @Length(1, 255)
  externalTransactionId!: string;

  @IsString()
  @Length(1, 255)
  roundId!: string;

  @IsString()
  @Length(1, 255)
  gameId!: string;

  @IsIn([
    WagerTransactionKind.Bet,
    WagerTransactionKind.Win,
    WagerTransactionKind.Loss,
    WagerTransactionKind.Refund,
    WagerTransactionKind.Rollback,
  ], {
    message: 'kind must be BET, WIN, LOSS, REFUND, or ROLLBACK',
  })
  kind!: WagerTransactionKind;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  money?: MoneyDto;

  @IsOptional()
  @IsString()
  @Matches(/^(?=.*[1-9])\d+\.\d{2}$/, {
    message: 'amount must be positive and have exactly two decimal places',
  })
  amount!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  referenceExternalTransactionId?: string;
}
