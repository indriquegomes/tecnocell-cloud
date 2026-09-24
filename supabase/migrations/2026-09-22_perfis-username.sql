-- Login por usuário (primeiro nome), não por e-mail.
-- username é o identificador que a pessoa digita na tela de login (ex: mariana,
-- isabela.ponciano). O e-mail continua existindo no auth.users por baixo, mas
-- ninguém precisa decorá-lo. Único e sem acento; NULL = conta legada que ainda
-- entra por e-mail.
alter table public.perfis
  add column if not exists username text;

create unique index if not exists perfis_username_key
  on public.perfis (username)
  where username is not null;
