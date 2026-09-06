# Telas — Pixaí (35 telas)

Nomes entre parênteses = id da tela no protótipo (`Pixaí.dc.html`, variável `screen`). Abra o arquivo no navegador e use o índice lateral para navegar direto a cada uma.

## Entrada
- **Splash** (`splash`) — logo + tagline "Envie Pix. Pague no cartão.", fundo azul degradê escuro, dots de loading.
- **Onboarding** (`ob`) — 4 slides: cartão no Pix, como funciona (3 passos), parcelamento, segurança. Botão "Pular" no topo.
- **Login** (`login`) — CPF + senha, "Esqueci minha senha".
- **Criar conta** (`cadastro`) — Nome completo, CPF, data de nascimento + campo par, (continua abaixo da linha 204 no arquivo — inclui e-mail/telefone/senha).
- **Código SMS** (`otp`) — confirmação por código.
- **Verificação de identidade** (`kyc`) — 3 passos incluindo confirmação de CPF via bases oficiais.
- **Estados da verificação** (`kycstatus`) — pendente/aprovado/reprovado.

## Fluxo Pix no cartão
- **Início** (`home`) — saldo, ações rápidas, atalho para tabs.
- **Hub do Pix** (`pixhub`) — entrada para enviar Pix.
- **Chave Pix** (`pixkey`) — tipo de chave: e-mail, CPF, telefone, aleatória.
- **Destinatário** (`recipient`) — confirmação de quem recebe (nome, banco, chave).
- **Valor** (`amount`) — valor do Pix + descrição opcional.
- **Escolher cartão** (`payment`) — à vista ou parcelado, taxas por parcela (`RATES`: 1x 3.99%, 2x 5.29%, 3x 6.59%, 6x 10.82%, 12x 18.98%).
- **Adicionar cartão** (`addcard`) — novo cartão.
- **Parcelamento** (`installments`) — detalhamento das parcelas.
- **Revisão** (`review`) — resumo antes de confirmar.
- **Autenticação** (`auth`) — biometria/senha antes de processar (fundo escuro).
- **Processando** (`processing`) — loading (fundo escuro), avança automaticamente para sucesso.
- **Pix enviado** (`success`) — confirmação com dados da transação.
- **Comprovante** (`receipt`) — recibo detalhado (nome, CPF mascarado, instituição, chave Pix).

## Erros e estornos
- **Cartão não autorizado** (`failauth`)
- **Limite insuficiente** (`faillimit`)
- **Transação em análise** (`failreview`)
- **Pix não concluído** (`failpix`)
- **Acompanhar estorno** (`refund`)

## Conta
- **Transações** (`history`) — lista com filtro (`filter` state, default "Todas").
- **Detalhe da transação** (`txdetail`)
- **Estado vazio** (`empty`) — sem transações.
- **Meus cartões** (`mycards`) — lista de cartões (Mastercard ••4821 principal, Visa ••9132).
- **Parcelamentos** (`parcelas`)
- **Limite Pix no cartão** (`limite`)
- **Notificações** (`notif`)
- **Central de Segurança** (`security`)
- **Suporte** (`support`) — chat.
- **Perfil** (`profile`)

## Navegação
Tab bar fixa em 5 seções: Início, Pix, Transações, Cartões, Perfil (ver `TABS` no protótipo para quais telas pertencem a cada tab). Telas de fundo escuro (`splash`, `auth`, `processing`) usam status bar clara; as demais usam status bar escura.

## Estados de formulário a implementar (não totalmente presentes no protótipo estático)
O protótipo mostra os inputs em estado neutro/preenchido. Ao implementar de verdade, cobrir:
- **Foco**: borda `#1769FF`, leve elevação.
- **Erro**: borda `#D14343`, mensagem de erro abaixo do campo, fundo `#FFF6F6` no card de alerta.
- **Sucesso/validado**: check verde (`#0F9D63` sobre `#E7F7EF`, mesmo padrão usado em `kyc`).
- **Carregando** (ex: consulta de CPF, envio de Pix): usar padrão de `processing` (spinner) — nunca travar o botão sem feedback.
