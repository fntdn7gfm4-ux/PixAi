# Plano de implementação — para o agente de coding

Execute em ordem. Cada etapa deve compilar/rodar antes de seguir para a próxima.

## 0. Setup
- [ ] Criar repositório (app + api, monorepo ou dois repos)
- [ ] Scaffold Expo (React Native) + scaffold NestJS/Fastify
- [ ] Configurar `.env` local com placeholders das chaves em `ARCHITECTURE.md`
- [ ] Configurar Postgres (local via docker-compose para dev)

## 1. Design system
- [ ] Criar `theme/tokens.ts` com as cores, tipografia (Manrope) e espaçamentos de `SCREENS.md`
- [ ] Componentes base: Button (primário/secundário), Input (com estados foco/erro/sucesso), Card, Pill/Badge, TabBar

## 2. Autenticação e cadastro (sem dependências externas ainda)
- [ ] Telas: Splash, Onboarding, Login, Criar conta, Código SMS — navegação e UI, sem backend real ainda (mock)
- [ ] Integrar provedor de autenticação (Cognito/Auth0/Supabase Auth) — cadastro e login reais
- [ ] Persistir usuário no Postgres

## 3. KYC
- [ ] Telas: Verificação de identidade, Estados da verificação
- [ ] Integrar provedor de KYC escolhido — chamar na etapa de confirmação de CPF, tratar pendente/aprovado/reprovado

## 4. Conta e cartões (sem dinheiro real)
- [ ] Home, Meus cartões, Adicionar cartão — CRUD de cartões via processadora (tokenização, nunca guardar PAN)
- [ ] Perfil, Notificações, Central de Segurança, Suporte — CRUD simples

## 5. Fluxo Pix no cartão (núcleo do produto)
- [ ] Hub do Pix → Chave Pix → Destinatário → Valor — mock de consulta de chave, depois integrar Pix-as-a-Service
- [ ] Escolher cartão → Parcelamento → Revisão → Autenticação — integrar processadora de cartão (cobrança/parcelamento)
- [ ] Processando → sucesso/erro — orquestrar backend: debitar cartão, disparar Pix, tratar timeout/falha
- [ ] Telas de erro: Cartão não autorizado, Limite insuficiente, Transação em análise, Pix não concluído, Acompanhar estorno

## 6. Histórico
- [ ] Transações, Detalhe da transação, Estado vazio, Comprovante (compartilhável/PDF)

## 7. Endurecimento
- [ ] Webhooks dos provedores (Pix, cartão) com verificação de assinatura
- [ ] Rate limiting e logs de auditoria na API
- [ ] Revisão LGPD: consentimento no cadastro, política de privacidade, endpoint de exclusão de dados
- [ ] Testes automatizados: fluxo feliz + cada tela de erro

## 8. Antes de produção
- [ ] Confirmar com jurídico/compliance a licença/parceria necessária para operar Pix e custódia de saldo
- [ ] Auditoria de segurança (pentest) antes de aceitar transações reais
- [ ] Build de release (EAS) e publicação nas lojas
