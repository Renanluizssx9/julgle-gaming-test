# Decisoes de arquitetura

## Consistencia financeira

PostgreSQL e a fonte de verdade. Cada operacao de aposta roda em uma transacao SQL que inclui wallet, wager transaction, ledger, Inbox quando a entrada vem do SQS, e Outbox. O ledger tem constraints aritmeticas, FK, unicidade por transacao e trigger que impede update/delete.

Operacoes da mesma wallet sao serializadas por advisory lock por player+moeda e lock pessimista na linha existente. Chaves de idempotencia/provider tambem usam advisory locks transacionais. Isso funciona entre processos e instancias, sem lock global em memoria. O schema mantem constraints como ultima linha de defesa.

## Idempotencia

`Idempotency-Key` e obrigatorio para submissao HTTP. O SHA-256 e calculado sobre JSON canonico dos campos de negocio, ordenados por nome, sem header ou metadados de transporte. Mesma chave e mesmo hash e replay; mesma chave com hash diferente e conflito HTTP 409. A unique constraint persiste a chave.

## Referencias e reversoes

Refund referencia uma BET; rollback referencia BET, WIN ou LOSS. Provider, player, wallet, rodada, moeda e valor precisam coincidir. Cada referencia aceita no maximo uma reversao de cada tipo. Reversoes de WIN que excederiam o saldo sao rejeitadas com `REVERSAL_INSUFFICIENT_FUNDS`; BET sem saldo usa `INSUFFICIENT_FUNDS`.

Referencias ausentes ficam `PENDING_REFERENCE`. O worker agenda oito tentativas com backoff exponencial de 1 segundo ate 30 segundos; esgotado o limite, rejeita com `REFERENCE_NOT_FOUND`. Uma referencia ainda pendente tambem e aguardada, nao rejeitada prematuramente.

## Mensageria

O Outbox e gravado no mesmo commit financeiro e publicado depois do commit. Publicacao pode ser repetida; consumidores devem deduplicar. A Inbox e unica por consumer+message ID, e so e reconhecida no SQS depois do commit de Inbox e processamento financeiro. A fila Inbox usa DLQ apos cinco entregas. O worker e habilitado apenas quando ambas as URLs estao configuradas.

## Autenticacao e operacao

Autenticacao foi omitida para priorizar as garantias financeiras, conforme permitido pelo desafio. Em producao, protegeriamos endpoints de provedores com um Identity Provider OIDC externo; mensagens SQS sao consideradas canal interno confiavel e continuam sujeitas a validacao de dominio.

Configuracoes de banco e SQS vem do ambiente. `.env.example` contem apenas credenciais locais de desenvolvimento; secrets de producao devem vir do gerenciador de secrets da plataforma.

## Limites conhecidos

O schema impede saldo negativo, mas ainda faltam testes de integracao automatizados com PostgreSQL/LocalStack e concorrencia em multiplos processos. O worker Outbox permite publicacao at-least-once, entao consumidores precisam de idempotencia. Logs estruturados, metricas operacionais e instrumentacao distribuida ainda precisam ser completados.
