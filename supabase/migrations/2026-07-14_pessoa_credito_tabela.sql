-- ============================================================
-- Ficha do cliente — campos do SIGE que valem: limite de crédito + tabela de
-- preço padrão por cliente. (Histórico de compras e fiado são calculados, sem
-- coluna nova.) Idempotente.
-- ============================================================

alter table pessoas add column if not exists limite_credito  numeric(12,2) default 0;
alter table pessoas add column if not exists tabela_preco_id uuid references tabelas_preco(id);
