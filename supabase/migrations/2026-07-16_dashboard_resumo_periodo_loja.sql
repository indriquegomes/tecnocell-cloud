-- ============================================================
-- dashboard_resumo agora aceita PERÍODO e LOJA.
--
-- Pedido da Isa (16/07): "Dashboard — mostrar o relatório separado por venda de
-- cada loja (por seleção)" e "mostrar por mês, ano e selecionar a loja ali em
-- 'todas as empresas'".
--
-- Motivo real por trás do pedido: o ranking de vendedores mostra
-- "ATENDIMENTO PETRÓPOLIS 01" no topo porque a janela de 30 dias tem ~27 dias de
-- SIGE (que só tinha login por LOJA) contra ~3 dias de TecnoCell. Não é bug — é a
-- janela. Com o filtro de período, a Isa escolhe "esta semana" e enxerga
-- MARIANA / MARIA EDUARDA / ISABELA / BRUNNA, que é o que ela quer ver.
--
-- SEM DOWNTIME — por que os 3 parâmetros são OBRIGATÓRIOS e a versão antiga fica:
--   Esta é uma função NOVA (3 args) ao lado da antiga de 1 arg, que continua viva.
--   Se eu tivesse feito DROP, haveria uma janela de dashboard quebrado: rodar o SQL
--   antes do deploy derruba a página no ar (que chama p_de30); deployar antes de
--   rodar chama função inexistente. Convivendo as duas, qualquer ordem funciona.
--   Os args são obrigatórios (sem DEFAULT) de propósito: com default, chamar com 1
--   argumento ficaria ambíguo entre as duas versões e o Postgres recusaria.
--   A antiga (1 arg) pode ser removida depois que o deploy estabilizar.
--
-- p_ate  null = até hoje.
-- p_loja null/'' = todas as lojas. Compara normalizado (upper + sem "TECNOCELL ")
-- porque o SIGE grava "TECNOCELL PETRÓPOLIS" e lojas.nome grava "Petrópolis".
--
-- Read-only (stable). Não altera nenhum dado.
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
    -- SIGE (o passado): só o que faturou de verdade.
    select coalesce(h.valor_final, 0) as valor_final, h.cliente, h.vendedor, h.loja
    from historico_vendas h, param
    where (h.data at time zone 'UTC')::date between param.de and param.ate
      and h.status = 'Pedido Faturado'
      and (param.loja is null
           or upper(trim(regexp_replace(coalesce(h.loja, ''), '^TECNOCELL\s+', '', 'i'))) = param.loja)

    union all

    -- TecnoCell (o presente): loja vem do caixa, cai pro depósito quando não houver.
    select coalesce(v.total, 0), pe.nome, v.vendedor_nome, l.nome
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
  -- Estoque NÃO depende de período (é saldo de agora). Depende de loja: quando a
  -- Isa filtra Petrópolis, o estoque mostrado tem que ser o dos depósitos dela.
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
    'lista_repor',   (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'saldo', saldo, 'min', minimo)), '[]'::jsonb) from repor)
  );
$function$;
