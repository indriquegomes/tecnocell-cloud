-- Apelido: linka o nome do Pix (pagador) ao cliente do sistema. O nome do Pix
-- nem sempre bate com o cadastro; o dono ensina uma vez e vale pros próximos.
create table if not exists pix_aliases (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null,
  pagador_norm text not null,
  pagador text not null,
  cliente text not null,
  created_at timestamptz not null default now(),
  unique (telegram_chat_id, pagador_norm)
);
