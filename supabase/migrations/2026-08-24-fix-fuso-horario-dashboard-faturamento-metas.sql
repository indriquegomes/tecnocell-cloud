-- dashboard_faturamento_metas classificava v.created_at (vendas.created_at,
-- timestamptz de verdade em UTC) por data em UTC — uma venda entre ~21h e
-- meia-noite (SP) contava pro dia seguinte, divergindo do dashboard_resumo,
-- que já converte a MESMA coluna pra America/Sao_Paulo.
--
-- h.data (historico_vendas, dado importado do SIGE) foi deixado como estava
-- (at time zone 'UTC') de propósito: dashboard_resumo trata essa coluna
-- exatamente assim também (conferido lendo o corpo dela antes de escrever
-- isto) — mudar aqui criaria uma divergência nova em vez de fechar a que
-- já existe.
CREATE OR REPLACE FUNCTION public.dashboard_faturamento_metas(p_de date, p_ate date)
 RETURNS TABLE(loja_id uuid, dia date, valor numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
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
$function$
