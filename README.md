# Pixaí — App Fintech (Pix no Cartão)

Site real, publicado no GitHub Pages, com login e cadastro de verdade
(contas reais via Supabase Auth + Postgres). O restante do fluxo (Pix,
cartão, KYC) é **simulado de propósito** — ver "O que é real vs. simulado"
abaixo e o aviso regulatório em `ARCHITECTURE.md`.

## Arquivos deste repositório

| Arquivo | O que é |
|---|---|
| `index.html` | O site real. Login/cadastro/logout via Supabase; cartões e histórico salvos por conta. É o que roda no GitHub Pages. |
| `support.js` | Runtime que faz `index.html` funcionar como app (interpreta `{{ variável }}`, `<sc-if>`, `<sc-for>` e liga a lógica da tela). |
| `config.js` | Onde você cola a URL + chave do seu projeto Supabase (ver "Configurar o backend" abaixo). |
| `supabase/schema.sql` | Script para rodar uma vez no seu projeto Supabase — cria as tabelas `profiles`/`cards`/`transactions` com Row Level Security. |
| `Pixaí.dc.html` | O protótipo visual **original**, sem lógica real — mantido como referência de design (as 35 telas, cores, tipografia e cópia originais). Não é o que está no ar. |
| `ARCHITECTURE.md`, `SCREENS.md`, `TASKS.md` | Documentação original do handoff de design (stack sugerida, lista das 35 telas, plano de implementação). |

## Configurar o backend (Supabase) — necessário para login/cadastro funcionarem

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** no projeto e rode o conteúdo de `supabase/schema.sql`.
3. Em **Authentication > Providers > Email**, desative **"Confirm email"**.
   O app faz login com um e-mail sintético gerado a partir do CPF (ex.:
   `cpf12345678900@usuarios.pixai.app`), que não existe de verdade — não
   há como confirmar por e-mail, e sem esse passo o cadastro trava.
4. Em **Project Settings > API**, copie a **Project URL** e a chave
   **anon public**, e cole no arquivo `config.js`.
5. Commit + push. O GitHub Pages já está configurado neste repositório e
   republica automaticamente a cada push na `main`.

A chave "anon public" é pública por design (fica no código do navegador) —
quem protege os dados de cada usuário são as políticas de Row Level
Security do `schema.sql`, não o sigilo da chave.

## O que é real vs. simulado

**Real:**
- Cadastro cria uma conta de verdade (Supabase Auth, senha com hash no
  servidor, nunca em texto puro).
- Login valida a senha de verdade contra essa conta.
- Sessão persiste entre recarregamentos da página (fecha e abre o
  navegador e continua logado).
- Toda tela do app (Início, Cartões, Transações etc.) exige login —
  tentar acessar direto pela barra lateral sem sessão redireciona pro
  login.
- Cartões adicionados e o histórico de Pix "enviados" são salvos de
  verdade no banco, por conta — cada usuário só vê os próprios dados.

**Simulado (de propósito — ver aviso abaixo):**
- Envio de Pix e cobrança no cartão: o fluxo roda inteiro (valor digitado,
  parcelamento calculado, histórico gravado), mas nenhum dinheiro se move
  de fato.
- Verificação de identidade (OTP/KYC): telas clicáveis, sem envio real de
  SMS nem checagem de documento.
- Número completo do cartão e CVV nunca são pedidos para armazenamento —
  só bandeira, últimos 4 dígitos e nome impresso ficam salvos.

### Por que não é tudo real
Pix de verdade e custódia de saldo exigem ligação com uma instituição de
pagamento autorizada pelo Banco Central. Cobrança no cartão exige
processadora certificada PCI-DSS — dados de cartão nunca devem ficar em
servidor próprio. KYC e LGPD exigem provedor especializado e política de
privacidade real. Nada disso é implementável só com código — ver
`ARCHITECTURE.md` para a lista de parceiros sugeridos, e validar com
jurídico/compliance antes de aceitar transações reais de usuários.

## Limitações conhecidas (próximos passos, se for adiante)
- O destinatário do Pix é sempre o mesmo contato de exemplo ("Mariana
  Alves") — não há busca real de chave Pix.
- A tela de detalhe de uma transação (`txdetail`) mostra dados ilustrativos,
  não os da transação real clicada.
- "Definir como principal" e "Remover cartão" na tela Meus Cartões ainda
  são apenas visuais.
- "Esqueci minha senha" foi removido por não haver fluxo de recuperação
  real ainda.

## Ordem de leitura recomendada (documentação original do handoff)
1. `ARCHITECTURE.md` — stack, subsistemas externos obrigatórios, variáveis de ambiente, estrutura de pastas
2. `SCREENS.md` — as 35 telas, agrupadas por fluxo, com design tokens e cópia exata
3. `TASKS.md` — checklist de implementação original (pré-integração com Supabase)
4. `Pixaí.dc.html` — protótipo visual original, sem lógica

## Assets
Fonte: Google Fonts "Manrope" (400/500/600/700/800). Sem imagens externas — ícones e ilustrações são divs/CSS (substituir por ícones SVG reais numa implementação nativa).
