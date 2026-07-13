-- ============================================================
-- Dois gráficos do SIGE que faltavam no dashboard (pedido do Vitor):
--   1. Fluxo Diário de Vendas do mês (linha/área por dia)
--   2. Visão Geral Orçamentos/Pedidos (pizza por status)
--
-- Entram DENTRO do dashboard_resumo que já existe — assim não custam nenhuma ida
-- extra ao banco (o dashboard já estava com 4 ondas de ida-e-volta; não quero
-- transformar em 6 por causa de dois gráficos).
--
-- As duas fontes são somadas, porque a operação está partida no meio da migração:
--   historico_vendas → tudo que veio do SIGE (até 04/07/2026)
--   vendas           → o que já é vendido aqui no TecnoCell
-- Sem juntar as duas, o gráfico de julho mostraria só metade da verdade.
--
-- Read-only (stable). Não altera nenhum dado.
-- ============================================================

create or replace function public.dashboard_resumo(p_de30 date)
returns jsonb
language sql
stable
security definer
as $function$
  with hist as (
    select valor_final, cliente, vendedor, loja
    from historico_vendas
    where data >= p_de30
  ),
  saldo as (
    select produto_id, sum(quantidade) as qtd
    from estoque
    where quantidade > 0
    group by produto_id
  ),
  est as (
    select
      coalesce(sum(s.qtd), 0)                                                     as unidades,
      count(*)                                                                    as pecas_com_estoque,
      coalesce(sum(s.qtd * coalesce(p.preco_custo, 0)) filter (where p.ativo), 0) as valor_estoque
    from saldo s
    left join produtos p on p.id = s.produto_id
  ),
  abaixo as (
    select p.id, p.nome, coalesce(s.qtd, 0) as saldo, p.estoque_minimo as minimo
    from produtos p
    left join saldo s on s.produto_id = p.id
    where p.ativo
      and coalesce(p.estoque_minimo, 0) > 0
      and coalesce(s.qtd, 0) < p.estoque_minimo
  ),
  top_cli as (
    select trim(cliente) as k, sum(coalesce(valor_final, 0)) as v
    from hist
    where trim(coalesce(cliente, '')) <> ''
      and cliente !~* 'consumidor|n(a|ã)o identif'
    group by trim(cliente) order by v desc limit 6
  ),
  top_vend as (
    select trim(vendedor) as k, sum(coalesce(valor_final, 0)) as v
    from hist
    where trim(coalesce(vendedor, '')) <> ''
    group by trim(vendedor) order by v desc limit 5
  ),
  top_loja as (
    select trim(regexp_replace(coalesce(loja, ''), 'TECNOCELL ', '', 'i')) as k,
           sum(coalesce(valor_final, 0)) as v
    from hist
    where trim(regexp_replace(coalesce(loja, ''), 'TECNOCELL ', '', 'i')) <> ''
    group by 1 order by v desc limit 3
  ),
  repor as (
    select nome, saldo, minimo from abaixo order by (saldo - minimo) asc limit 12
  ),

  -- ===== GRÁFICO 1: fluxo diário do mês (SIGE + TecnoCell somados) =====
  vendas_do_mes as (
    select date(data) as dia, coalesce(valor_final, 0) as valor
    from historico_vendas
    where data >= date_trunc('month', current_date)
      and status = 'Pedido Faturado'
    union all
    select date(created_at) as dia, coalesce(total, 0) as valor
    from vendas
    where created_at >= date_trunc('month', current_date)
      and status = 'concluida'
  ),
  dias as (
    -- todo dia do mês até hoje, mesmo os sem venda (senão a linha "pula" buracos)
    select generate_series(date_trunc('month', current_date), current_date, interval '1 day')::date as dia
  ),
  fluxo as (
    select d.dia, coalesce(sum(v.valor), 0) as valor, count(v.valor) as n
    from dias d
    left join vendas_do_mes v on v.dia = d.dia
    group by d.dia
    order by d.dia
  ),

  -- ===== GRÁFICO 2: visão geral por status (mês) =====
  status_mes as (
    select
      count(*) filter (where status = 'Pedido Faturado')  as faturados,
      count(*) filter (where status = 'Pedido Cancelado') as cancelados,
      count(*) filter (where status ilike '%Aprovado%')   as aprovados,
      count(*) filter (where status = 'Pedido')           as abertos
    from historico_vendas
    where data >= date_trunc('month', current_date)
  ),
  status_novo as (
    select
      count(*) filter (where status = 'concluida') as faturados,
      count(*) filter (where status = 'cancelada') as cancelados,
      count(*) filter (where status = 'aberta')    as abertos
    from vendas
    where created_at >= date_trunc('month', current_date)
  )

  select jsonb_build_object(
    'n_vendas',          (select count(*)                      from hist),
    'faturamento',       (select coalesce(sum(valor_final), 0) from hist),
    'unidades',          (select unidades          from est),
    'pecas_com_estoque', (select pecas_com_estoque from est),
    'valor_estoque',     (select valor_estoque     from est),
    'abaixo_min',        (select count(*) from abaixo),
    'top_clientes',      (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_cli),
    'top_vendedores',    (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_vend),
    'lojas',             (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_loja),
    'lista_repor',       (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'saldo', saldo, 'min', minimo)), '[]'::jsonb) from repor),

    -- gráfico 1
    'fluxo_diario',      (select coalesce(jsonb_agg(jsonb_build_object(
                             'dia', to_char(dia, 'DD'), 'valor', valor, 'n', n) order by dia), '[]'::jsonb) from fluxo),
    'fluxo_total',       (select coalesce(sum(valor), 0) from fluxo),

    -- gráfico 2 (as duas fontes somadas)
    'status_pedidos',    (select jsonb_build_object(
                             'faturados',  (select faturados  from status_mes) + (select faturados  from status_novo),
                             'cancelados', (select cancelados from status_mes) + (select cancelados from status_novo),
                             'aprovados',  (select aprovados  from status_mes),
                             'abertos',    (select abertos    from status_mes) + (select abertos    from status_novo)
                           ))
  );
$function$;
