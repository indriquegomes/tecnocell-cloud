-- Trocas SP: peça que saiu pra troca com fornecedor (defeito/garantia).
-- status: enviado -> voltou (fornecedor devolveu o item) | abatido (descontou da dívida).
create table if not exists public.trocas_sp (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  fornecedor text not null,
  quantidade int not null default 1,
  valor numeric(10,2) not null default 0,
  loja_id uuid references lojas(id),
  status text not null default 'enviado',
  observacao text,
  criado_por uuid,
  created_at timestamptz default now(),
  resolvido_em timestamptz
);
create index if not exists idx_trocas_sp_status on trocas_sp (status);
