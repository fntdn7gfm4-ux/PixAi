# Arquitetura — Pixaí

## Stack sugerida
- **App**: React Native (Expo) — cobre iOS/Android com uma base; se preferirem nativo puro, Kotlin/Compose (Android) é a alternativa direta ao pedido original.
- **Backend**: Node.js (NestJS ou Fastify) ou similar, API REST/GraphQL própria que orquestra os provedores abaixo — o app nunca fala direto com PSP/processadora.
- **Banco de dados**: Postgres gerenciado (Supabase, Neon ou RDS).
- **Autenticação**: Provedor gerenciado (Supabase Auth, AWS Cognito ou Auth0) — não implementar hashing/sessão do zero.
- **Hospedagem**: Vercel/Railway (API), EAS Build (app), domínio próprio.

## Subsistemas externos obrigatórios

| Subsistema | Função | Provedor sugerido | Onde entra no fluxo |
|---|---|---|---|
| Pix-as-a-Service | Enviar/receber Pix real, homologado no BACEN | Celcoin, Dock, QiTech, Matera, Stark Bank | Telas `pixkey`, `recipient`, `amount`, `processing` |
| Tap to Pay / cobrança por aproximação | Celular como maquininha | GoPag (API/SDK white-label) | Fluxo de recebimento (fora das 35 telas atuais — a adicionar) |
| Processadora de cartão | Cobrar/parcelar no cartão do pagador | Pagar.me, Stripe, Cielo API, Rede | Telas `payment`, `addcard`, `installments`, `review`, `auth` |
| KYC / verificação de identidade | Confirmar identidade, prevenir fraude | idwall, CAF, Serpro Datavalid | Telas `cadastro`, `otp`, `kyc`, `kycstatus` |
| LGPD / compliance | Proteção de dados, consentimento | Consultoria jurídica + política de privacidade | Cadastro + toda a base de dados pessoais |

Nenhum desses pode ser "implementado" apenas com código — exigem cadastro comercial/jurídico com o provedor antes da integração técnica.

## Estrutura de pastas sugerida
```
/app                    # React Native (Expo)
  /screens              # uma pasta por tela, nomes conforme SCREENS.md
  /components           # componentes reutilizáveis (Button, Input, Card, StatusPill)
  /theme                # tokens.ts (cores, tipografia, espaçamento) — ver SCREENS.md
  /navigation           # stack + tabs (ver TABS no protótipo)
  /api                  # clientes HTTP para o backend próprio (nunca para PSP direto)
/api                    # backend (NestJS/Fastify)
  /modules/auth
  /modules/users         # cadastro, KYC
  /modules/pix           # integração Pix-as-a-Service
  /modules/cards         # integração processadora + parcelamento
  /modules/transactions   # histórico, comprovantes, estornos
```

## Variáveis de ambiente (backend)
```
DATABASE_URL=
AUTH_PROVIDER_KEY=
PIX_PROVIDER_API_KEY=
PIX_PROVIDER_WEBHOOK_SECRET=
CARD_PROCESSOR_API_KEY=
CARD_PROCESSOR_WEBHOOK_SECRET=
KYC_PROVIDER_API_KEY=
```
Nunca commitar valores reais — usar `.env` + secret manager (Doppler, AWS Secrets Manager, etc).

## Design tokens (extraídos do protótipo)
- Cor primária: `#1769FF` · texto principal: `#101828` · texto secundário: `#5A6579` · texto mudo: `#8792A6`
- Fundo app: `#F7F9FC` · fundo card: `#fff` · borda: `#E6EBF3` / `#EBF0F8`
- Sucesso: `#0F9D63` / `#E7F7EF` · erro: `#D14343` / `#FFF6F6`
- Tipografia: Manrope, pesos 400–800; títulos de tela `800 26-32px`, corpo `500 14.5-15px`
- Raio: 14px (inputs), 18-22px (cards), 999px (pills/badges)
- Animações: fade/slide de entrada ~0.2-0.3s ease-out (`riseIn`, `scrIn`), sem exageros
