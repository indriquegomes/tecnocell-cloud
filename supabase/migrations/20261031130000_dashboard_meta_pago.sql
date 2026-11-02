-- ============================================================================
-- Meta por PAGAMENTO REAL (31/10/2026) — velocímetro da vendedora
--
-- A meta do dashboard (dashboard_faturamento_metas) soma o TOTAL VENDIDO
-- (vendas.total, inclui fiado). O velocímetro novo da vendedora precisa subir
-- só com PAGAMENTO REAL (dinheiro/PIX/cartão recebido, status 'pago'), sem
-- fiado nem vale. Este RPC devolve esse total por (loja, dia).
--
-- Loja = caixa da venda ou depósito da venda (mesma régua do dashboard_faturamento_metas).
-- ============================================================================

create or replace function public.dashboard_meta_pago(p_de date, p_ate date)
returns table(loja_id uuid, dia date, valor numeric)
 language sql
 stable
 security definer
as $function$
  select
    coalesce(cx.loja_id, dp.loja_id)                as loja_id,
    (v.data at time zone 'America/Sao_Paulo')::date as dia,
    sum(pv.valor)::numeric                           as valor
  from pagamentos_venda pv
  join vendas v      on v.id = pv.venda_id
  left join caixas cx    on cx.id = v.caixa_id
  left join depositos dp on dp.id = v.deposito_id
  where pv.status = 'pago'
    and v.status = 'concluida'
    and (v.data at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    and coalesce(cx.loja_id, dp.loja_id) is not null
  group by 1, 2;
$function$;
