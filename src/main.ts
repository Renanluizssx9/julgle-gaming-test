import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT') ?? 3000);

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: 'wallets', method: RequestMethod.POST },
      { path: 'wallets/:walletId', method: RequestMethod.GET },
      { path: 'wallets/:walletId/ledger', method: RequestMethod.GET },
      { path: 'wallets/:walletId/reconciliation', method: RequestMethod.GET },
      { path: 'wallets/:walletId/reconciliation', method: RequestMethod.POST },
      { path: 'wagering/transactions', method: RequestMethod.POST },
      { path: 'wagering/transactions/:transactionId', method: RequestMethod.GET },
      {
        path: 'providers/:providerId/wagering/transactions/:externalTransactionId',
        method: RequestMethod.GET,
      },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port);
  console.log(`Wagering API running on http://localhost:${port}`);
}

bootstrap();
