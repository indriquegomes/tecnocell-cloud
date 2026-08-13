-- Zeramento de saldos mantendo o histórico — início da operação real.
-- Zera: estoque, saldo de vale/crédito, dívida de fiado, valores de caixa.
-- NÃO toca em: vendas, itens_venda, historico_itens_venda, pagamentos_venda,
-- notas_entrada, devolucoes, produtos, pessoas, tabelas de preço, eventos_sige.

-- 1) ESTOQUE ----------------------------------------------------------------
-- Registra a baixa em movimentacoes_estoque ANTES de zerar, senão o log fica
-- com um buraco (o estoque cairia do nada). Convenção da tabela: `quantidade`
-- é o delta absoluto e `operacao` diz a direção.
insert into movimentacoes_estoque
  (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por)
select
  produto_id,
  deposito_id,
  case when quantidade > 0 then 'saida' else 'entrada' end,
  abs(quantidade)::int,
  quantidade::int,
  0,
  'Zeramento de saldos — início da operação real',
  'sistema'
from estoque
where quantidade <> 0;

update estoque set quantidade = 0, updated_at = now() where quantidade <> 0;

-- 2) VALE / CRÉDITO DO CLIENTE ----------------------------------------------
-- creditos_clientes é razão, não saldo: nada é apagado nem alterado.
-- Entra UMA linha de estorno por cliente com saldo, no valor exato do saldo.
insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao)
select
  pessoa_id,
  max(pessoa_nome),
  sum(case when tipo in ('uso', 'estorno') then -valor else valor end),
  'estorno',
  'Zeramento de saldo — início da operação real'
from creditos_clientes
group by pessoa_id
having sum(case when tipo in ('uso', 'estorno') then -valor else valor end) > 0.004;

-- 3) FIADO -------------------------------------------------------------------
-- A dívida É a linha pendente: não existe tabela de baixas onde contra-lançar.
-- Marcar como 'pago' inventaria receita; contra-lançar em 'pagar' criaria dívida
-- falsa. Cancelar preserva a linha inteira (valor, vencimento, venda_id,
-- historico_pagamentos) e a tira dos totais, que filtram status = 'pendente'.
update lancamentos
set status = 'cancelado',
    descricao = coalesce(descricao, '') || ' [zerado 2026-08-13]',
    updated_at = now()
where tipo = 'receber' and status = 'pendente';

-- 4) CONTAS ------------------------------------------------------------------
-- No-op hoje (nenhuma conta tem saldo_inicial <> 0), fica pela idempotência.
update contas set saldo_inicial = 0 where coalesce(saldo_inicial, 0) <> 0;

-- 5) CAIXAS ------------------------------------------------------------------
-- Zera os valores. Não fecha os 2 caixas abertos — isso é operação, não saldo.
update caixas
set valor_abertura  = 0,
    valor_fechamento = case when valor_fechamento is null then null else 0 end
where coalesce(valor_abertura, 0) <> 0 or coalesce(valor_fechamento, 0) <> 0;
