# Jungle Gaming Wagering API

Financial Domain Invariants
Wallet balances can never become negative.
Monetary operations require matching currencies.
Ledger entries must reconcile balance_before, amount and balance_after.
Terminal transactions cannot transition to another state.
Idempotent requests produce exactly one financial outcome.

Inbox Processing Flow
SQS ↓ Inbox ↓ Idempotency Validation ↓ ProcessWagerTransactionService ↓ BET / WIN / LOSS / REFUND / ROLLBACK ↓ Inbox Processed

## Rodar localmente

Requisitos: Bun 1.x e Docker.

```powershell
Copy-Item .env.example .env
bun install
docker compose up -d postgres
bun run migrate
bun run start
```

A API fica em `http://localhost:3000`. Os testes unitários rodam com `bun test` (`bun run test`); testes reais com PostgreSQL/LocalStack rodam com `bun run test:integration`. `npm run test:vitest` fica disponível como alternativa de desenvolvimento.

## Processar uma transacao

Envie `POST /wagering/transactions` (o alias antigo `POST /api/transactions/process` continua disponível):

Header obrigatório: `Idempotency-Key: demo:win-001`.

```json
{
	"walletId": "11111111-1111-4111-8111-111111111111",
	"playerId": "22222222-2222-4222-8222-222222222222",
	"providerId": "demo",
	"externalTransactionId": "win-001",
	"roundId": "round-001",
	"gameId": "game-001",
	"kind": "WIN",
	"money": { "amount": "20.00", "currency": "BRL" }
}
```

Tipos processados: `BET`, `WIN`, `LOSS`, `REFUND` e `ROLLBACK`. Refund só referencia BET; rollback pode referenciar BET, WIN ou LOSS. Valor, moeda, wallet, player e rodada devem coincidir; cada referência aceita no máximo um refund e um rollback. Referências ausentes são persistidas como `PENDING_REFERENCE`, tentadas oito vezes com backoff exponencial até 30 segundos, e então rejeitadas com `REFERENCE_NOT_FOUND`.

O payload de negócio é serializado em ordem canônica e recebe SHA-256. Repetir a mesma chave e o mesmo payload retorna replay; reutilizar a chave com payload diferente retorna `409 Conflict`. O header não entra no hash. Transações anteriores à migration de idempotência recebem a chave `providerId:externalTransactionId` e são comparadas pelos campos persistidos. Apostas sem saldo e reversões inválidas são persistidas como rejeitadas e respondem `422`; operações aguardando referência respondem `202`.

O PostgreSQL local usa banco `wagering`, usuario `wagering` e senha `wagering`, conforme o `docker-compose.yml`.

## Wallets e health

- `POST /wallets` cria a wallet; saldo inicial positivo cria transação interna `OPENING` e lançamento de crédito atômicos.
- `GET /wallets/:walletId` consulta saldo e versão.
- `GET /wallets/:walletId/ledger?cursor=...&limit=50` lista o ledger por cursor estável.
- `POST /wallets/:walletId/reconciliation` compara o saldo armazenado ao reconstruído pelo ledger.
- `GET /wagering/transactions/:transactionId` e `GET /providers/:providerId/wagering/transactions/:externalTransactionId` consultam transações.
- `GET /health/live` verifica liveness; `GET /health/ready` verifica PostgreSQL e SQS.

As rotas anteriores também ficam disponíveis com prefixo `/api` quando aplicável.

## SQS local

Para iniciar o LocalStack e criar as filas:

```powershell
docker compose up -d localstack
bun run sqs:setup
```

O `.env.example` já inclui as URLs locais para as filas. O worker publica eventos pendentes na fila Outbox e registra mensagens recebidas da FIFO `wager-transactions.fifo`. Mensagens que falharem cinco vezes vão para `wager-transactions-dlq.fifo`; falhas transitórias do worker usam backoff crescente até 30 segundos. A garantia de idempotência vem do PostgreSQL, não do FIFO. Sem as duas URLs, o worker fica desligado. Os valores do `.env.example` são apenas para desenvolvimento local; use credenciais próprias fora dele.
