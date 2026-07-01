-- ============================================================
-- Convites de usuária — o admin cria a conta e gera um link; a funcionária
-- define a PRÓPRIA senha no 1º acesso (sem auto-cadastro aberto).
--
-- A conta (auth + perfil) é criada com senha aleatória; o link /convite/<token>
-- deixa ela definir a senha real. Token único, expira em 7 dias, uso único.
-- Idempotente. Seguro reaplicar.
-- ============================================================

create table if not exists convites (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique,
  user_id    uuid not null,
  nome       text,
  usado      boolean default false,
  expires_at timestamptz,
  criado_por uuid,
  created_at timestamptz default now()
);
