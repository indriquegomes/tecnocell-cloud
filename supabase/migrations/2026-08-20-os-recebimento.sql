-- ============================================================
-- Recebimento da Ordem de Serviço (Isa 29/07: "botão de recebimento da OS").
-- Marca quando/como a OS foi paga — serve de TRAVA contra receber 2x.
-- O dinheiro em si entra no caixa da loja (movimentos_caixa) + lançamento pago
-- na conta da forma, igual a um recebimento de fiado. Idempotente.
-- ============================================================
alter table ordens_servico add column if not exists recebido_em timestamptz;
alter table ordens_servico add column if not exists forma_recebimento text;
