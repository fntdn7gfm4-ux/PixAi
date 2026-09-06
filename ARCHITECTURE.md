# Arquitetura v2

## Aplicação

```text
Navegador (public/) → /api/* (server/worker.mjs) → D1
                               ↓
                      Pricing Engine central
                               ↓
                     sandbox de dados fictícios

PSP / KYC / e-mail reais: NÃO CONECTADOS
```

O frontend não possui taxas nem calcula o preço de uma cobrança. Cotações são criadas no servidor com UUID, expiração, sessão e revisão da configuração. A confirmação aceita apenas cotação, parcelamento, cenário e consentimento; não aceita totais, CPF, e-mail, chave Pix ou dados do cartão enviados pelo cliente.

## Modelo de dados

- `settings`: configuração validada e revisão para concorrência otimista.
- `sessions`: identificadores aleatórios, expiração em 24 horas.
- `quotes`: preço emitido, sessão, expiração e versão dos preços.
- `operations`: operações **sandbox**, cotação e chave de idempotência únicas, hash da requisição, estados e valores.
- `challenges`: digest do código, validade, tentativas e consumo atômico.
- `audit`: ações administrativas, confirmações e consultas. Sem dados pessoais ou cartão.
- `rate_limits`: contadores atômicos persistentes por IP resumido e sessão.
- `webhook_events`: tabela preparada; nenhum webhook externo é aceito até implementar o formato e a validação do parceiro.

O banco publicado é D1. A configuração inicial de preços é definida em um único módulo do servidor e persistida quando o administrador a edita. Não há cadastro tradicional nem integração com o Supabase antigo. O esquema Drizzle só cria tabelas desta nova aplicação. Dados legados permanecem intactos.

## Precificação

Dinheiro em centavos e taxas em ppm. O motor calcula:

```text
lucro-alvo = max(teto(Pix × margem mínima), lucro mínimo absoluto)
total-mínimo = teto((Pix + lucro-alvo + custo fixo gateway + custo operacional)
                    / (1 − taxa gateway − tributos − reserva antifraude))
parcela = teto comercial para terminação 0,90, nunca para baixo
total = parcela × quantidade
```

Gateway, tributos e reserva são arredondados individualmente para cima. Se o lucro em centavos ficar abaixo do alvo, a parcela sobe novamente. A taxa oficial aceita pelo motor tem precedência sobre a tabela de referência; ainda não existe API de PSP conectada que forneça tal taxa.

## Estados

`CREATED → AWAITING_PAYMENT → PROCESSING_PAYMENT → PAYMENT_APPROVED → PIX_PROCESSING → PIX_SENT → COMPLETED`.

Recusa, análise, falha Pix, estorno e chargeback possuem transições explícitas em `server/states.mjs`. Em sandbox, o cenário escolhido exercita a sequência sem fazer chamadas financeiras. Não existe autorização real nem execução automática de Pix.

## Contrato futuro do adaptador oficial

Antes de habilitar homologação, o adaptador escolhido deverá implementar e testar:

1. Cotação oficial: custo por parcelamento, custo fixo, validade, instituição responsável e campos legais/CET aplicáveis.
2. Identificação: e-mail real verificado, CPF/CNPJ conforme a operação, validação KYC, titularidade, identificação do recebedor e consulta de chave conforme o parceiro.
3. Checkout tokenizado: campos hospedados/SDK oficial; PAN e CVV nunca passam pelo nosso backend; autenticação 3DS e resultado de antifraude quando aplicáveis.
4. Cobrança após confirmação explícita: idempotência também no PSP, referência da operação e captura/estado definitivo reconciliado.
5. Liberação de Pix: apenas após satisfação das regras contratuais; beneficiário validado, saldo/funding e idempotência própria. Aprovação do cartão não basta para concluir o Pix.
6. Webhook: verificar assinatura oficial sobre bytes originais, timestamp, evento único, vínculo da conta/ambiente, IDs, valores, moeda e ordem permitida de estados. Persistir antes de confirmar recebimento; conciliar em caso de evento ausente ou fora de ordem.
7. Compensação: consulta de estado antes de repetir chamada incerta, estorno, chargeback, fila de revisão e reconciliação de liquidação/antecipação.
8. E-mail transacional: outbox persistente, envio idempotente de comprovante e OTP, segredo do desafio, limites por identidade, expiração, consumo único e sessão limitada à operação verificada.

## Ambientes

`APP_ENV=sandbox` é o único modo executável nesta entrega e aceita somente fixtures. `homologation` e `production` retornam 503 nas operações da aplicação, mesmo se houver chaves no ambiente. O health informa `paymentsEnabled=false` em todos os casos. Após a integração, serão necessários projetos, bancos e segredos separados; nunca promover transações de demonstração ao livro de operações reais.

## Limites desta entrega

Não há tokenização, KYC/AML, fingerprinting comercial, limite por CPF/cartão/chave real, fila operacional, envio de e-mail, auditoria imutável, conciliação de PSP ou monitoramento de chargeback ativos. A chave administrativa estática é apropriada somente a este teste restrito; produção exige identidade administrativa, MFA, permissões e rotação. Os dados de teste persistem sem rotina de expurgo automática; definir retenção e limpeza antes de ampliar o uso.
