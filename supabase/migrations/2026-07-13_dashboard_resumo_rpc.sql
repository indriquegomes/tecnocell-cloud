-- ============================================================
-- PERF: dashboard_resumo() — soma no banco em vez de puxar tudo pro JS.
--
-- Antes o dashboard fazia 3 fetchAll a cada load:
--   • TODOS os produtos ativos (7.997 → 8 idas ao banco, paginado de 1000)
--   • TODAS as linhas de estoque com qtd > 0
--   • ~6.000 linhas de historico_vendas (30 dias)
-- ...pra calcular ~10 números. Resultado: 2,6s de carregamento.
--
-- Agora: 1 chamada, tudo agregado no Postgres.
--
-- A lógica é IDÊNTICA à do JS que substitui — inclusive os detalhes:
--   • unidades / peças-com-estoque contam TODA linha com qtd>0 (mesmo de produto inativo)
--   • valor do estoque só soma produto ATIVO (inativo entrava como custo 0)
--   • "abaixo do mínimo" inclui produto ativo SEM linha de estoque (saldo 0 < mínimo)
--   • top clientes ignora "consumidor"/"não identificado"; loja tira o prefixo "TECNOCELL "
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
      coalesce(sum(s.qtd), 0)                                                  as unidades,
      count(*)                                                                 as pecas_com_estoque,
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
    select nome, saldo, minimo
    from abaixo
    order by (saldo - minimo) asc
    limit 12
  )
  select jsonb_build_object(
    'n_vendas',      (select count(*)                          from hist),
    'faturamento',   (select coalesce(sum(valor_final), 0)     from hist),
    'unidades',           (select unidades           from est),
    'pecas_com_estoque',  (select pecas_com_estoque  from est),
    'valor_estoque',      (select valor_estoque      from est),
    'abaixo_min',    (select count(*) from abaixo),
    'top_clientes',  (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_cli),
    'top_vendedores',(select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_vend),
    'lojas',         (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_loja),
    'lista_repor',   (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'saldo', saldo, 'min', minimo)), '[]'::jsonb) from repor)
  );
$function$;
