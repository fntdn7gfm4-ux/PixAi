# PixAI / Pixaí — plataforma de avaliação

Nova experiência web para Pix pago no cartão, sem conta ou senha tradicional.

**Teste online:** https://pixai-teste.offlucas.chatgpt.site/

**Estado:** sandbox funcional com servidor e banco persistente. Não é uma operação financeira em produção. Não há cobrança, Pix, KYC, 3DS ou e-mail reais. Os formulários usam dados fictícios e a API rejeita campos de cartão/documento.

## O que funciona

- Home com as quatro ofertas solicitadas, outro valor e opções de 1 a 12 parcelas.
- Pricing Engine exclusivo do servidor, dinheiro em centavos, taxas em partes por milhão e aritmética inteira. Margem mínima de 30%, piso de lucro, arredondamento para cima em parcelas terminadas em R$ 0,90 e conferência dos custos arredondados individualmente.
- Revisão explícita antes da simulação; cotação de dez minutos, vinculada à sessão e à versão dos preços, recalculada ao confirmar.
- Cenários de aprovação, recusa, revisão manual e cartão aprovado com falha no Pix. Recibo identificável e exportável como texto.
- Consulta com desafio de uso único, expiração, limite de tentativas e isolamento por sessão. **O código aparece na tela: não é OTP por e-mail nem autenticação de produção.**
- Painel administrativo protegido por segredo do servidor, métricas de teste, edição persistente de preços e área de integrações.
- Cookie HttpOnly/Secure/SameSite, CSP, validação de origem, SQL parametrizado, rate limiting persistente, idempotência, trilha de auditoria e bloqueio de todas as rotas financeiras reais.
- Logo oficial original preservada em `public/assets/pixai-logo-oficial.png` e usada no cabeçalho, rodapé e recibo visual.

## Executar localmente

Requer Node.js 24 ou superior.

```sh
npm ci
cp .env.example .env
# Gere ADMIN_TOKEN aleatório com pelo menos 32 caracteres em .env.
npm run dev
```

Acesse `http://127.0.0.1:4173`. SQLite local fica em `.local/pixai.sqlite`, fora do Git. Na instalação feita nesta máquina, `.env` já contém a chave administrativa aleatória. Nunca compartilhe ou commite esse arquivo.

```sh
npm test
npm run build
npm run db:generate
```

Os testes cobrem margem, ofertas, arredondamento, taxas do parceiro, idempotência, consentimento, sessões isoladas, códigos expirados/usados, cenários, conflitos de preços, bloqueio de produção e proteção de rotas. A geração de migrações é necessária apenas após mudar `db/schema.ts`; não reescreva migrações já publicadas.

## Administração

Abra `/#admin` no site e informe o valor de `ADMIN_TOKEN` configurado no servidor. No ambiente local desta entrega, ele está no arquivo `.env`, que é ignorado pelo Git. O token não é pré-preenchido, incluído em URLs nem salvo no navegador. Encerrar o acesso ou fechar a aba remove a credencial da memória.

Os percentuais do painel são apresentados em %. Internamente, 30% = 300000 ppm. Novos preços invalidam cotações anteriores. As ofertas são pisos comerciais: o motor pode elevar a parcela para preservar a margem. Reduzir a margem abaixo de 30% é proibido. Custos iniciais zerados não significam isenção tributária ou custo real zero.

## Publicação

Frontend e API compartilham a origem no Sites, com Worker e D1. `.openai/hosting.json` guarda somente o identificador do projeto e o nome lógico de D1. O build gera `dist/client`, `dist/server/index.js` e migrações em `dist/.openai/drizzle`.

O GitHub Pages não executa o backend. O `index.html` da raiz encaminha para o novo site. A aplicação publicada usa `public/index.html`. O CI verifica testes e build; a publicação do Worker é feita pelo Sites a partir de uma versão salva, sem segredos no repositório.

## Próximos passos para operações reais

Consulte [PARTNERS.md](PARTNERS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md) e [TASKS.md](TASKS.md). Não há interruptor que transforme esta demonstração em operação real apenas inserindo chaves. É necessário implementar o adaptador oficial do parceiro escolhido, testar e homologar.

O código antigo, documentação e esquema Supabase foram preservados em `docs/legacy`. **Não aplique o esquema antigo e não reative seu runtime**: ele permitia histórico simulado controlado pelo cliente. Os dados existentes do Supabase não foram acessados, alterados nem excluídos.
