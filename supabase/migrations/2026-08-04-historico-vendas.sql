-- Histórico de vendas importado do SIGE (referência / "o que cada cliente comprou").
-- Tabela SEPARADA e read-only: NÃO é a tabela `vendas` operacional (não afeta saldos,
-- DRE nem estoque). São ~236 mil faturamentos passados (2018→2026) trazidos do SIGE.
-- Importado depois pelo script scratchpad/import-historico.cjs.

create table if not exists historico_vendas (
  sige_id text primary key,
  codigo bigint,
  data timestamptz,
  data_faturamento timestamptz,
  loja text,
  status text,
  vendedor text,
  categoria text,
  origem text,
  cliente text,
  cidade text,
  estado text,
  frete numeric default 0,
  desconto numeric default 0,
  comissao numeric default 0,
  valor_final numeric default 0,
  pdv numeric default 0,
  ecommerce numeric default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_hist_vendas_cliente on historico_vendas (lower(cliente));
create index if not exists idx_hist_vendas_data on historico_vendas (data);
create index if not exists idx_hist_vendas_vendedor on historico_vendas (vendedor);
