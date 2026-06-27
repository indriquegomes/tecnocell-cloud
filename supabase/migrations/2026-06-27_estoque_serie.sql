-- Etapa 1 do módulo Estoque — campos novos no produto + controle serializado
-- Seguro: só ADICIONA. Não altera nem apaga dados existentes.

-- 5 campos novos no cadastro de produto
alter table produtos add column if not exists ean text;
alter table produtos add column if not exists fornecedor_id text references pessoas(id) on delete set null;
alter table produtos add column if not exists prateleira text;
alter table produtos add column if not exists estoque_minimo integer default 0;
alter table produtos add column if not exists controla_serie boolean default false;

-- Unidades serializadas: 1 linha = 1 aparelho físico (IMEI / nº série)
create table if not exists numeros_serie (
  id          uuid primary key default uuid_generate_v4(),
  produto_id  text references produtos(id) on delete cascade,
  deposito_id text references depositos(id) on delete set null,
  serie       text not null,
  status      text default 'em_estoque',  -- em_estoque | vendido | devolvido | defeito
  custo       numeric(12, 2),
  venda_id    text,
  observacao  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(produto_id, serie)
);

create index if not exists idx_numeros_serie_produto on numeros_serie(produto_id);
create index if not exists idx_numeros_serie_status on numeros_serie(status);

alter table numeros_serie enable row level security;
