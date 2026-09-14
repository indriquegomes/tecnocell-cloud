-- Índices de performance — aceleram vendas, relatórios, estoque e fiados.
-- Só leitura acelerada; não muda dado. Seguro aplicar (if not exists).

create index if not exists idx_vendas_status_created on vendas (status, created_at);
create index if not exists idx_vendas_caixa_status on vendas (caixa_id, status, created_at);
create index if not exists idx_itens_venda_venda on itens_venda (venda_id);
create index if not exists idx_itens_venda_produto on itens_venda (produto_id);
create index if not exists idx_pagamentos_venda_venda on pagamentos_venda (venda_id);
create index if not exists idx_lancamentos_tipo_status_venc on lancamentos (tipo, status, data_vencimento);
create index if not exists idx_estoque_prod_dep on estoque (produto_id, deposito_id);
create index if not exists idx_os_created on ordens_servico (created_at);
