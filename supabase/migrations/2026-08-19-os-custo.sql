-- ============================================================
-- Custo na Ordem de Serviço (Isa 29/07: relatório de serviços com "valores de
-- lucro e custo"). `total` já existe (valor cobrado do cliente); falta o custo
-- (peças/insumos). Lucro = total - custo. Idempotente.
-- ============================================================
alter table ordens_servico add column if not exists custo numeric not null default 0;
