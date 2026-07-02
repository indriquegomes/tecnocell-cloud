-- ============================================================
-- Pessoas: soft delete. Não dá pra apagar quem já movimentou (venda/crédito)
-- sem perder histórico — então inativa em vez de excluir.
-- Idempotente. Seguro reaplicar.
-- ============================================================

alter table pessoas add column if not exists ativo boolean default true;
update pessoas set ativo = true where ativo is null;
