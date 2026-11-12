import { Type } from 'class-transformer';
import {
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

class InitialBalanceDto {
  @IsString()
  @Matches(/^\d+\.\d{2}$/)
  amount!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export class CreateWalletDto {
  @IsUUID()
  playerId!: string;

  @ValidateNested()
  @Type(() => InitialBalanceDto)
  initialBalance!: InitialBalanceDto;
}
