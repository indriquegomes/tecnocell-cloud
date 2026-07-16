-- ============================================================
-- Histórico de itens vendidos (importado do SIGE) — dá base de MESES pra a Reposição.
--
-- A aba Reposição só tinha as vendas do próprio sistema (desde 13/07 — poucos dias),
-- então o cálculo de pedido não fazia sentido. Aqui entra o que o SIGE tem: itens
-- vendidos ("Pedido Faturado") dos últimos 90 dias, AGREGADO por produto+dia (leve).
--
-- A Reposição soma esta tabela + itens_venda no período. Só na visão "Todos os
-- depósitos" (é a demanda TOTAL — o SIGE não separa por depósito). Com filtro de
-- depósito específico, a Reposição usa só o dado local do sistema.
-- ============================================================

create table if not exists public.historico_itens_venda (
  id          uuid default gen_random_uuid() primary key,
  produto_id  text not null references produtos(id),
  data        date not null,
  quantidade  numeric not null default 0,
  origem      text not null default 'sige',
  created_at  timestamptz default now(),
  unique (produto_id, data, origem)
);

create index if not exists idx_hist_itens_data     on public.historico_itens_venda (data);
create index if not exists idx_hist_itens_produto  on public.historico_itens_venda (produto_id);
