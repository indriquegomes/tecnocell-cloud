-- ============================================================
-- Tabela de preço: faixa de quantidade (atacado). Um produto pode ter vários
-- preços na mesma tabela, cada um a partir de uma quantidade mínima.
-- Ex: 1un = R$50, 10un = R$45. O PDV pega a faixa conforme a qtd no carrinho.
-- Idempotente. Seguro reaplicar.
-- ============================================================

alter table itens_tabela_preco add column if not exists quantidade_minima int default 1;
update itens_tabela_preco set quantidade_minima = 1 where quantidade_minima is null;

-- permite o mesmo produto em faixas diferentes; barra faixa duplicada
create unique index if not exists itens_tabela_preco_faixa_unica
  on itens_tabela_preco (tabela_id, produto_id, quantidade_minima);
