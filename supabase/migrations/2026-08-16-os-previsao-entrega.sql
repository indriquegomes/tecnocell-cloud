-- ============================================================
-- Ordem de Serviço: previsão de entrega (data + hora de saída do aparelho).
-- Isa 29/07: "previsão de data + horário de saída do aparelho".
-- (A data/hora de ENTRADA já é o created_at.) Idempotente.
-- ============================================================
alter table ordens_servico add column if not exists previsao_entrega timestamptz;
