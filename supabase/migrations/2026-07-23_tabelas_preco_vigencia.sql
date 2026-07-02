-- ============================================================
-- Tabelas de preço: vigência (data início/fim). Tabela vale só no período;
-- fora dele o PDV não oferece. Datas nulas = sempre válida.
-- Idempotente. Seguro reaplicar.
-- ============================================================

alter table tabelas_preco add column if not exists data_inicio date;
alter table tabelas_preco add column if not exists data_fim    date;
