-- Meta de venda: passa a contar o TOTAL VENDIDO (vendas.total, inclui fiado), não o dinheiro recebido.
-- Motivo: a meta é de VENDA. A loja vende quase tudo no fiado; contar só o "cash" (sem fiado)
-- deixava a barra em ~18% com a meta já batida. Decisão do dono (29/09): meta = total vendido.
-- Também exclui o lixo do SIGE: vendas importadas com numero >= 100000 têm data ERRADA (setembro)
-- e somam ~R$ 3M — entrariam na meta e estourariam o número. Só venda real (numero < 100000) conta.

create or replace function public.dashboard_faturamento_metas(p_de date, p_ate date)
returns table(loja_id uuid, dia date, valor numeric)
 language sql
 stable
 security definer
as $function$
  -- vendas do sistema: TOTAL VENDIDO (inclui fiado), por loja e dia
  select
    coalesce(cx.loja_id, dp.loja_id)                as loja_id,
    (v.data at time zone 'America/Sao_Paulo')::date as dia,
    sum(v.total)::numeric                            as valor
  from vendas v
  left join caixas cx      on cx.id = v.caixa_id
  left join depositos dp   on dp.id = v.deposito_id
  where v.status = 'concluida'
    and (v.data at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    and (v.numero < 100000 or v.numero is null)
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
