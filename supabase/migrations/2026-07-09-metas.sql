-- Sistema de metas por loja e período, com faixas gamificadas (GRANADA→JOALHERIA).
-- id uuid com default → inserts não precisam gerar id na mão.
create table if not exists metas (
  id          uuid primary key default gen_random_uuid(),
  loja_id     text,
  rotulo      text not null,
  data_inicio date not null,
  data_fim    date not null,
  dias_uteis  int  not null default 26,
  ativo       boolean not null default true,
  created_at  timestamptz default now()
);

create table if not exists metas_faixas (
  id       uuid primary key default gen_random_uuid(),
  meta_id  uuid not null references metas(id) on delete cascade,
  nome     text not null,
  valor    numeric not null default 0,
  premio   numeric not null default 0,
  ordem    int not null default 0
);

create index if not exists idx_metas_faixas_meta on metas_faixas(meta_id);
