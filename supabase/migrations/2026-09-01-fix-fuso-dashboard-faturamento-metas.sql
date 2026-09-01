-- REGRESSÃO DE FUSO: dashboard_faturamento_metas voltou a classificar por UTC.
--
-- Linha do tempo:
--   2026-08-24-fix-fuso-horario-dashboard-faturamento-metas.sql
--     trocou (v.created_at at time zone 'UTC') por 'America/Sao_Paulo', porque
--     uma venda entre ~21h e meia-noite (SP) contava pro dia SEGUINTE e
--     divergia do dashboard_resumo, que já usa SP (2026-07-17, linhas 47 e 89).
--   2026-08-25-vale-credito-forma-pagamento.sql (linhas 206-238)
--     recriou a função para excluir 'vale_credito' do cash-in. O comentário
--     dela diz "único ponto alterado: o not in (...) ganhou 'vale_credito'",
--     mas o corpo foi copiado da versão ANTERIOR ao fix — as linhas 215 e 222
--     voltaram para 'UTC'. A mesma migration fez isso com finalizar_venda
--     (v_today := current_date); ali a 2026-08-28-retirada-entrega-venda.sql
--     restaurou o fuso. Aqui ninguém restaurou.
--
-- Efeito hoje: toda venda depois das 21h entra na meta do dia seguinte, e o
-- faturamento das metas não bate com o dashboard.
--
-- Este arquivo é o corpo da 2026-08-25 (que mantém a exclusão do vale) com o
-- fuso do lado das VENDAS de volta em America/Sao_Paulo. Conferido por diff:
-- nenhuma outra linha mudou.
--
-- h.data (historico_vendas, importado do SIGE) continua 'UTC' de propósito —
-- dashboard_resumo trata essa mesma coluna assim; mudar aqui criaria uma
-- divergência nova em vez de fechar a que existe.
--
-- Assinatura idêntica (p_de date, p_ate date) → CREATE OR REPLACE substitui de
-- verdade, sem criar sobrecarga. Não precisa de DROP.

create or replace function public.dashboard_faturamento_metas(p_de date, p_ate date)
returns table(loja_id uuid, dia date, valor numeric)
 language sql
 stable
 security definer
as $function$
  -- vendas do sistema: cash (exclui fiado E vale), por loja e dia
  select
    coalesce(cx.loja_id, dp.loja_id)              as loja_id,
    (v.created_at at time zone 'America/Sao_Paulo')::date as dia,
    sum(pv.valor)::numeric                          as valor
  from vendas v
  join pagamentos_venda pv on pv.venda_id = v.id
  left join caixas cx      on cx.id = v.caixa_id
  left join depositos dp   on dp.id = v.deposito_id
  where v.status = 'concluida'
    and (v.created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    and pv.forma_pagamento_id not in (select id from formas_pagamento where tipo in ('fiado', 'vale_credito'))
    and coalesce(cx.loja_id, dp.loja_id) is not null
  group by 1, 2

  union all

  -- histórico do SIGE: "Pedido Faturado", por loja e dia
  select
    l.id                                            as loja_id,
    (h.data at time zone 'UTC')::date               as dia,
    sum(h.valor_final)::numeric                      as valor
  from historico_vendas h
  join lojas l on upper(trim(regexp_replace(h.loja, '^TECNOCELL\s+', '', 'i'))) = upper(trim(l.nome))
  where h.status = 'Pedido Faturado'
    and (h.data at time zone 'UTC')::date between p_de and p_ate
  group by 1, 2;
$function$;
