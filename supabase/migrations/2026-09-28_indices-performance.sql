-- Índices de performance (faltavam: toda consulta por data/status varria a tabela inteira).
CREATE INDEX IF NOT EXISTS idx_vendas_created_at ON vendas (created_at);
CREATE INDEX IF NOT EXISTS idx_vendas_status ON vendas (status);
CREATE INDEX IF NOT EXISTS idx_itens_venda_venda_id ON itens_venda (venda_id);
CREATE INDEX IF NOT EXISTS idx_movimentos_caixa_caixa_id ON movimentos_caixa (caixa_id);
