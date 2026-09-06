-- Pixaí — esquema real do backend (Supabase / Postgres)
--
-- Como usar:
--   1. Crie um projeto em https://supabase.com (plano gratuito serve).
--   2. Abra o "SQL Editor" do projeto e cole/rode este arquivo inteiro.
--   3. Em Authentication > Providers > Email, desative "Confirm email"
--      (o app faz login com um e-mail sintético gerado a partir do CPF,
--      que não existe de verdade — não há como confirmar por e-mail).
--   4. Em Project Settings > API, copie "Project URL" e a chave
--      "anon public" para o arquivo config.js do site.
--
-- O que isto cria:
--   - profiles: 1 linha por usuário autenticado (nome, cpf, etc.)
--   - cards: cartões salvos pelo usuário (nunca número completo nem CVV)
--   - transactions: histórico de Pix "enviados" pelo app (SIMULADO —
--     nenhum valor é movimentado de verdade; ver README/ARCHITECTURE.md
--     sobre por que Pix e cobrança no cartão de verdade exigem parceiros
--     regulados pelo Bacen / PCI-DSS, não apenas código).
--
-- Segurança: a chave "anon public" é pública por design — quem protege os
-- dados é a Row Level Security (RLS) abaixo, não o sigilo da chave.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  cpf text,
  celular text,
  email_contato text,
  saldo_limite numeric not null default 4850.00,
  verificado boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- ---------------------------------------------------------------------
-- cards (apenas bandeira + últimos 4 dígitos + nome impresso — nunca o
-- número completo, validade ou CVV)
-- ---------------------------------------------------------------------
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand text not null,
  last4 text not null,
  holder text not null,
  is_main boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.cards enable row level security;

drop policy if exists "cards: select own" on public.cards;
create policy "cards: select own" on public.cards
  for select using (auth.uid() = user_id);

drop policy if exists "cards: insert own" on public.cards;
create policy "cards: insert own" on public.cards
  for insert with check (auth.uid() = user_id);

drop policy if exists "cards: update own" on public.cards;
create policy "cards: update own" on public.cards
  for update using (auth.uid() = user_id);

drop policy if exists "cards: delete own" on public.cards;
create policy "cards: delete own" on public.cards
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- transactions (histórico de Pix simulados)
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text not null,
  recipient_key text,
  amount numeric not null,
  installments int not null default 1,
  fee numeric not null default 0,
  total numeric not null,
  card_id uuid references public.cards(id) on delete set null,
  status text not null default 'Concluído',
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

drop policy if exists "transactions: select own" on public.transactions;
create policy "transactions: select own" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "transactions: insert own" on public.transactions;
create policy "transactions: insert own" on public.transactions
  for insert with check (auth.uid() = user_id);
