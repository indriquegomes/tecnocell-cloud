-- ============================================================
-- ESTORNO DE CUSTO DA DEVOLUÇÃO — a régua certa, num lugar só.
--
-- Quando o cliente devolve uma peça BOA, ela volta para o estoque e o custo dela tem de
-- sair do resultado (senão o mês fica pior do que a verdade). Quando a peça NÃO volta
-- (troca/avaria), o custo continua onde está — a perda dela é lançada como despesa.
--
-- Até 23/11/2026 cada relatório fazia essa conta do seu jeito: o DRE abatia o custo de
-- TODA devolução (inclusive das peças que saíram para o fornecedor e nunca voltaram),
-- usando o custo do CADASTRO de hoje em vez do custo travado na venda. Isso inflava o
-- lucro do mês (novembro: R$ 16.154,87 a mais) e mudava se alguém editasse o cadastro.
--
-- Esta VIEW é a fonte única, sem tabela nova e sem trigger (nada para dessincronizar):
--   • só item com status_produto = 'ok' (peça que voltou ao estoque);
--   • custo travado na venda (`itens_venda.custo_unitario`), com o cadastro só de reserva
--     para venda antiga que não tem o valor travado;
--   • traz o tipo de crédito da devolução, para separar peça que voltou de dinheiro que
--     voltou (são coisas diferentes: `sem_reembolso` não devolve receita).
--
-- Use em relatório, fechamento e conferência: `select sum(custo) from v_estorno_custo_devolucao
-- where created_at >= … and created_at < …`.
-- Idempotente. Seguro reaplicar.
-- ============================================================
create or replace view public.v_estorno_custo_devolucao as
select
  d.id                                    as devolucao_id,
  d.created_at                            as created_at,
  d.venda_id                              as venda_id,
  d.deposito_id                           as deposito_id,
  d.tipo_credito                          as tipo_credito,
  it.id                                   as item_devolucao_id,
  it.produto_id                           as produto_id,
  it.nome                                 as produto_nome,
  coalesce(it.quantidade, 0)              as quantidade,
  coalesce(it.total_item, 0)              as valor_venda,
  coalesce(iv.custo_unitario, p.preco_custo, 0) as custo_unitario,
  round(coalesce(iv.custo_unitario, p.preco_custo, 0) * coalesce(it.quantidade, 0), 2) as custo
from public.itens_devolucao it
join public.devolucoes d on d.id = it.devolucao_id
left join public.produtos p on p.id = it.produto_id
left join public.itens_venda iv
  on iv.venda_id = d.venda_id and iv.produto_id = it.produto_id
where coalesce(it.status_produto, 'ok') = 'ok';
