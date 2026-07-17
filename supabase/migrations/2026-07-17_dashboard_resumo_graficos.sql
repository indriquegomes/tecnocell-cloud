-- ============================================================
-- dashboard_resumo (3 args) volta a devolver os GRÁFICOS.
--
-- Regressão que EU causei: ao criar a versão de 3 args (período+loja) em
-- 2026-07-16, esqueci de trazer `fluxo_diario`/`fluxo_total` e `status_pedidos`
-- que existiam na versão de 1 arg (2026-07-13_dashboard_graficos). A página lê
-- R.fluxo_diario → undefined → o card do gráfico (que só aparece se
-- fluxoDiario.length > 0) sumia silenciosamente. Os DOIS gráficos do dashboard
-- (fluxo diário + status) ficaram invisíveis.
--
-- Pedido da Isa (17/07): "adicionar a aba de vendas e, ao passar o mouse, mostrar
-- o valor vendido no dia". O gráfico já existia — só tinha sumido. Aqui ele volta,
-- agora respeitando o PERÍODO e a LOJA escolhidos no filtro.
--
-- Só ADIONA campos ao JSON de saída; nada dos números existentes muda. Read-only.
-- ============================================================

create or replace function public.dashboard_resumo(
  p_de   date,
  p_ate  date,
  p_loja text
)
returns jsonb
language sql
stable
security definer
as $function$
  with param as (
    select p_de as de,
           coalesce(p_ate, current_date) as ate,
           nullif(upper(trim(coalesce(p_loja, ''))), '') as loja
  ),
  hist as (
    -- SIGE (o passado): só o que faturou de verdade. Agora com a DATA (pro gráfico).
    select coalesce(h.valor_final, 0) as valor_final, h.cliente, h.vendedor, h.loja,
           (h.data at time zone 'UTC')::date as dia
    from historico_vendas h, param
    where (h.data at time zone 'UTC')::date between param.de and param.ate
      and h.status = 'Pedido Faturado'
      and (param.loja is null
           or upper(trim(regexp_replace(coalesce(h.loja, ''), '^TECNOCELL\s+', '', 'i'))) = param.loja)

    union all

    -- TecnoCell (o presente): loja vem do caixa, cai pro depósito quando não houver.
    select coalesce(v.total, 0), pe.nome, v.vendedor_nome, l.nome,
           (v.created_at at time zone 'America/Sao_Paulo')::date
    from vendas v
    left join pessoas   pe on pe.id = v.pessoa_id
    left join caixas    cx on cx.id = v.caixa_id
    left join depositos d  on d.id  = v.deposito_id
    left join lojas     l  on l.id  = coalesce(cx.loja_id, d.loja_id)
    cross join param
    where (v.created_at at time zone 'America/Sao_Paulo')::date between param.de and param.ate
      and v.status = 'concluida'
      and (param.loja is null or upper(trim(coalesce(l.nome, ''))) = param.loja)
  ),
  -- espinha de dias do período: todo dia entra, mesmo sem venda (barra some, não pula)
  dias as (
    select generate_series(param.de, param.ate, interval '1 day')::date as dia from param
  ),
  fluxo as (
    select ds.dia, coalesce(sum(h.valor_final), 0) as valor, count(h.dia) as n
    from dias ds left join hist h on h.dia = ds.dia
    group by ds.dia
  ),
  -- status dos pedidos no período (as duas fontes somadas), respeitando a loja
  status_hist as (
    select
      count(*) filter (where h.status = 'Pedido Faturado')  as faturados,
      count(*) filter (where h.status = 'Pedido Cancelado') as cancelados,
      count(*) filter (where h.status ilike '%Aprovado%')   as aprovados,
      count(*) filter (where h.status = 'Pedido')           as abertos
    from historico_vendas h, param
    where (h.data at time zone 'UTC')::date between param.de and param.ate
      and (param.loja is null
           or upper(trim(regexp_replace(coalesce(h.loja, ''), '^TECNOCELL\s+', '', 'i'))) = param.loja)
  ),
  status_novo as (
    select
      count(*) filter (where v.status = 'concluida') as faturados,
      count(*) filter (where v.status = 'cancelada') as cancelados,
      count(*) filter (where v.status = 'aberta')    as abertos
    from vendas v
    left join caixas    cx on cx.id = v.caixa_id
    left join depositos d  on d.id  = v.deposito_id
    left join lojas     l  on l.id  = coalesce(cx.loja_id, d.loja_id)
    cross join param
    where (v.created_at at time zone 'America/Sao_Paulo')::date between param.de and param.ate
      and (param.loja is null or upper(trim(coalesce(l.nome, ''))) = param.loja)
  ),
  saldo as (
    select e.produto_id, sum(e.quantidade) as qtd
    from estoque e
    left join depositos d on d.id = e.deposito_id
    left join lojas     l on l.id = d.loja_id
    cross join param
    where e.quantidade > 0
      and (param.loja is null or upper(trim(coalesce(l.nome, ''))) = param.loja)
    group by e.produto_id
  ),
  est as (
    select
      coalesce(sum(s.qtd), 0)                                                     as unidades,
      count(*)                                                                    as pecas_com_estoque,
      coalesce(sum(s.qtd * coalesce(p.preco_custo, 0)) filter (where p.ativo), 0) as valor_estoque
    from saldo s left join produtos p on p.id = s.produto_id
  ),
  abaixo as (
    select p.id, p.nome, coalesce(s.qtd, 0) as saldo, p.estoque_minimo as minimo
    from produtos p left join saldo s on s.produto_id = p.id
    where p.ativo and coalesce(p.estoque_minimo, 0) > 0
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
    select upper(trim(regexp_replace(coalesce(loja, ''), 'TECNOCELL ', '', 'i'))) as k,
           sum(coalesce(valor_final, 0)) as v
    from hist
    where trim(regexp_replace(coalesce(loja, ''), 'TECNOCELL ', '', 'i')) <> ''
    group by 1 order by v desc limit 3
  ),
  repor as (
    select nome, saldo, minimo from abaixo order by (saldo - minimo) asc limit 12
  )
  select jsonb_build_object(
    'n_vendas',      (select count(*)                      from hist),
    'faturamento',   (select coalesce(sum(valor_final), 0) from hist),
    'unidades',           (select unidades           from est),
    'pecas_com_estoque',  (select pecas_com_estoque  from est),
    'valor_estoque',      (select valor_estoque      from est),
    'abaixo_min',    (select count(*) from abaixo),
    'top_clientes',  (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_cli),
    'top_vendedores',(select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_vend),
    'lojas',         (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_loja),
    'lista_repor',   (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'saldo', saldo, 'min', minimo)), '[]'::jsonb) from repor),
    -- GRÁFICOS (voltaram): fluxo diário de vendas + status dos pedidos
    'fluxo_diario',  (select coalesce(jsonb_agg(jsonb_build_object(
                         'dia', to_char(dia, 'DD'), 'valor', valor, 'n', n) order by dia), '[]'::jsonb) from fluxo),
    'fluxo_total',   (select coalesce(sum(valor), 0) from fluxo),
    'status_pedidos',(select jsonb_build_object(
                         'faturados',  coalesce((select faturados  from status_hist), 0) + coalesce((select faturados  from status_novo), 0),
                         'cancelados', coalesce((select cancelados from status_hist), 0) + coalesce((select cancelados from status_novo), 0),
                         'aprovados',  coalesce((select aprovados  from status_hist), 0),
                         'abertos',    coalesce((select abertos    from status_hist), 0) + coalesce((select abertos    from status_novo), 0)
                       ))
  );
$function$;
