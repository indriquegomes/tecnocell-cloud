-- Zera vendas e compras operacionais (pedido do dono, 31/08).
--
-- Escopo: só as tabelas de venda/compra da operação nova (pós-SIGE). NÃO toca em:
--   - historico_vendas / historico_itens_venda: arquivo read-only importado do SIGE
--     (~236 mil vendas 2018→2026), não é operacional, não afeta saldo nem estoque.
--   - financeiro (lancamentos, creditos_clientes), caixa (caixas, movimentos_caixa),
--     estoque (produtos/estoque/movimentacoes_estoque/numeros_serie), pedidos, OS.
--
-- lancamentos.venda_id, numeros_serie.venda_id e creditos_clientes.venda_id não têm
-- FK pra vendas (colunas soltas) — ficam com um id que não existe mais depois deste
-- truncate, mas isso não quebra nada (não são usados pra join obrigatório).

truncate table
  itens_devolucao,
  devolucoes,
  pagamentos_venda,
  itens_venda,
  vendas,
  itens_nota_entrada,
  notas_entrada
restart identity;
