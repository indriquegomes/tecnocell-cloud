-- Caixa POR LOJA (antes era global — 1 caixa pro sistema todo).
-- Cada loja abre/fecha o seu caixa; venda só entra com o caixa da loja aberto.
-- caixas.loja_id = de qual loja é o caixa. vendas.caixa_id = em qual caixa a venda entrou.

alter table caixas  add column if not exists loja_id  uuid references lojas(id);
alter table vendas  add column if not exists caixa_id uuid references caixas(id);

-- 1 caixa aberto por LOJA (não mais global). Índice parcial garante a regra no banco.
create unique index if not exists uniq_caixa_aberto_por_loja
  on caixas (loja_id) where status = 'aberto';

create index if not exists idx_vendas_caixa on vendas (caixa_id);
