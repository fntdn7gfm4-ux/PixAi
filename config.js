/*
 * Configuração do backend real (Supabase) usado pelo app Pixaí.
 *
 * 1. Crie um projeto gratuito em https://supabase.com
 * 2. Rode o conteúdo de `supabase/schema.sql` no SQL Editor do projeto
 *    (cria as tabelas profiles/cards/transactions com Row Level Security,
 *    e desativa a confirmação por e-mail é feito manualmente — ver README)
 * 3. Em Project Settings > API, copie "Project URL" e a chave "anon public"
 *    e cole abaixo. Essas duas informações são feitas para ficar no
 *    código do lado do cliente (não são segredo) — a segurança real vem
 *    das políticas de Row Level Security do banco.
 */
window.PIXAI_CONFIG = {
  SUPABASE_URL: 'https://fpgcxxbhiyxpfqsoadvh.supabase.co',
  SUPABASE_ANON_KEY: 'COLE_AQUI_A_CHAVE_ANON_PUBLIC',
};
