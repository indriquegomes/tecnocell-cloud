-- ============================================================
-- PERF do dashboard: o faturamento das metas num único comando.
--
-- Antes, o dashboard puxava TODAS as vendas do período + TODOS os pagamentos +
-- TODO o histórico do SIGE pro Node e somava lá — muitas linhas trafegadas e
-- várias viagens ao banco (cada uma custa latência na Vercel). Em produção isso
-- mantinha o dashboard em ~2,7s.
--
-- Agora o banco SOMA e devolve já agregado por (loja, dia): uma viagem, poucas
-- linhas. Mesma regra de negócio de sempre:
--   • Vendas do sistema: soma pagamentos_venda EXCLUINDO fiado (cash-in real),
--     loja = caixa.loja_id senão deposito.loja_id.
--   • Histórico do SIGE: soma valor_final dos "Pedido Faturado" (conta cheio, sem
--     forma de pagamento), casando "TECNOCELL PETRÓPOLIS" → loja "Petrópolis".
-- Dia em UTC (bate com o created_at.slice(0,10) que o Node usava).
--
-- Só LÊ (stable). A app ainda cacheia o retorno por 2 min por cima disto.
-- ============================================================

create or replace function public.dashboard_faturamento_metas(p_de date, p_ate date)
returns table(loja_id uuid, dia date, valor numeric)
 language sql
 stable
 security definer
as $function$
  -- vendas do sistema: cash (exclui fiado), por loja e dia
  select
    coalesce(cx.loja_id, dp.loja_id)              as loja_id,
    (v.created_at at time zone 'UTC')::date        as dia,
    sum(pv.valor)::numeric                          as valor
  from vendas v
  join pagamentos_venda pv on pv.venda_id = v.id
  left join caixas cx      on cx.id = v.caixa_id
  left join depositos dp   on dp.id = v.deposito_id
  where v.status = 'concluida'
    and (v.created_at at time zone 'UTC')::date between p_de and p_ate
    and pv.forma_pagamento_id not in (select id from formas_pagamento where tipo = 'fiado')
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
