-- Limpeza total de movimento + remoção do SIGE.
-- O histórico real fica no SIGE, que continua rodando. Aqui sobra só cadastro,
-- pra recomeçar os testes com poucos itens.
--
-- MANTIDO (cadastro/configuração):
--   pessoas, produtos, categorias, marcas, depositos, lojas, empresas,
--   contas, formas_pagamento, maquinas_cartao, forma_conta_loja,
--   tabelas_preco, itens_tabela_preco, promocoes + itens/faixas/tabelas,
--   metas, metas_faixas, perfis, cargos, convites, configuracoes,
--   escalas, escala_excecoes, checklists_modelo, lembretes,
--   estoque (as linhas produto×depósito ficam, todas zeradas)
--
-- Nenhuma tabela mantida tem FK apontando pra alguma tabela desta lista,
-- então o TRUNCATE não cascateia pro cadastro.

truncate table
  -- vendas e derivados
  vendas,
  itens_venda,
  pagamentos_venda,
  historico_vendas,
  historico_itens_venda,
  devolucoes,
  itens_devolucao,
  -- financeiro
  lancamentos,
  creditos_clientes,
  vales_credito,
  transferencias,
  -- caixa
  caixas,
  movimentos_caixa,
  -- estoque (movimento; a tabela `estoque` de saldo NÃO entra)
  movimentacoes_estoque,
  numeros_serie,
  notas_entrada,
  itens_nota_entrada,
  pedidos,
  itens_pedido,
  consignados,
  itens_consignado,
  -- ordens de serviço
  ordens_servico,
  itens_os,
  os_checklists,
  -- SIGE
  eventos_sige,
  sige_conferencia,
  -- bot de comprovantes / Telegram
  comprovantes_pix,
  pix_periodos,
  -- RH e operação
  pontos,
  banco_horas,
  lembretes_feitos,
  -- diversos
  logs_atividade,
  apelidos_cliente,
  chat_sessoes,
  chat_mensagens,
  sync_log
restart identity;

-- Garante que o saldo de estoque continua zerado (o zeramento anterior já fez isso).
update estoque set quantidade = 0, updated_at = now() where quantidade <> 0;

-- As tabelas do SIGE não têm mais nenhum leitor no código: podem sair de vez.
drop table if exists eventos_sige;
drop table if exists sige_conferencia;
