# Handoff: Pixaí — App Fintech (Pix no Cartão)

Pacote para implementação em codebase real (ex: via Codex/Claude Code). Feito para um agente de coding ler e construir a partir daqui — comece pelo `TASKS.md`.

## O que é isto
`Pixaí.dc.html` é um **protótipo de referência visual** com as 35 telas do fluxo (ver lista completa em `SCREENS.md`), em alta fidelidade (cores, tipografia, espaçamento e cópia finais). Ele não é código de produção — não tem backend, autenticação real, nem integração com nenhum provedor. A tarefa do agente é **recriar essas telas** em um app real (recomendação: React Native ou Flutter para o app; Next.js se decidirem por também ter versão web) consumindo APIs verdadeiras.

## Ordem de leitura recomendada
1. `ARCHITECTURE.md` — stack, subsistemas externos obrigatórios, variáveis de ambiente, estrutura de pastas
2. `SCREENS.md` — as 35 telas, agrupadas por fluxo, com design tokens e cópia exata
3. `TASKS.md` — checklist de implementação em ordem, para o agente executar incrementalmente
4. `Pixaí.dc.html` — abrir no navegador para ver/clicar no fluxo completo

## Aviso regulatório (não pular)
Pix real e custódia de saldo exigem ligação com uma instituição de pagamento autorizada pelo Banco Central. Cartão exige processadora certificada PCI-DSS — nunca armazenar dados de cartão em servidor próprio. KYC e LGPD exigem provedor especializado e política de privacidade real. Nada disso é implementável só com código — validar com jurídico/compliance antes de aceitar transações reais de usuários.

## Assets
Fonte: Google Fonts "Manrope" (400/500/600/700/800). Sem imagens externas — ícones e ilustrações são divs/CSS no protótipo (substituir por ícones SVG reais na implementação).
