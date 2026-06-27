create table if not exists movimentacoes_estoque (
  id           uuid        primary key default gen_random_uuid(),
  produto_id   text        not null,
  deposito_id  text        not null,
  operacao     text        not null check (operacao in ('entrada', 'saida', 'ajuste')),
  quantidade   integer     not null,
  qtd_anterior integer     not null default 0,
  qtd_nova     integer     not null,
  observacao   text,
  criado_por   text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_movimentacoes_produto    on movimentacoes_estoque (produto_id);
create index if not exists idx_movimentacoes_created_at on movimentacoes_estoque (created_at desc);

alter table movimentacoes_estoque enable row level security;
