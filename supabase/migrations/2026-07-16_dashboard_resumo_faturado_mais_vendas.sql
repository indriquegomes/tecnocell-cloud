-- ============================================================
-- CORREÇÃO DE DINHEIRO no dashboard_resumo(). Dois bugs numa CTE só.
--
-- 1) CONTAVA PEDIDO CANCELADO COMO FATURAMENTO.
--    O `hist` somava historico_vendas SEM filtrar status. Em 30 dias isso inflava
--    o faturamento em R$ 94.365,20 — 24,5% a mais (R$ 478.995,86 mostrado vs
--    R$ 384.630,66 real). O dono decidia em cima de um número que não existia.
--    Regra do Vitor (16/07): "só é faturamento quando o dinheiro entra ou paga.
--    Se não é isso, é dívida ou é orçamento." → só `Pedido Faturado` conta.
--    ("Pedido Aprovado Sem Faturamento" = R$ 6.960,10 → NÃO conta, é só pedido.)
--
-- 2) IGNORAVA AS VENDAS DO PRÓPRIO SISTEMA.
--    O `hist` só olhava historico_vendas (SIGE), que parou em 13/07 quando
--    Petrópolis migrou. O dashboard estava CONGELADO e piorava a cada dia: nada
--    que as meninas vendem no TecnoCell aparecia. Por isso o top de vendedores
--    mostrava "ATENDIMENTO PETRÓPOLIS 01" (o SIGE só tinha login por LOJA) em vez
--    de MARIANA / MARIA EDUARDA / ISABELA / BRUNNA — que o TecnoCell já registra
--    corretamente em cada venda.
--
-- Não há risco de contagem dupla: cada venda existe em UM sistema só (conferido
-- produto a produto em 16/07 — ver Obsidian "Estado da migração SIGE → TecnoCell").
--
-- O RPC dos gráficos (2026-07-13_dashboard_graficos) e o das metas
-- (2026-07-15_dashboard_faturamento_metas) JÁ faziam isso certo — este era o
-- único fora do padrão, e era o que aparecia no card do topo.
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
    -- SIGE (o passado): só o que faturou de verdade
    select coalesce(valor_final, 0) as valor_final, cliente, vendedor, loja
    from historico_vendas
    where data >= p_de30
      and status = 'Pedido Faturado'

    union all

    -- TecnoCell (o presente): as vendas do sistema.
    -- loja vem do caixa (fonte principal) e cai pro depósito quando não houver.
    select coalesce(v.total, 0), pe.nome, v.vendedor_nome, l.nome
    from vendas v
    left join pessoas   pe on pe.id = v.pessoa_id
    left join caixas    cx on cx.id = v.caixa_id
    left join depositos d  on d.id  = v.deposito_id
    left join lojas     l  on l.id  = coalesce(cx.loja_id, d.loja_id)
    where v.created_at >= p_de30
      and v.status = 'concluida'
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
    -- upper() é obrigatório: o SIGE grava "TECNOCELL PETRÓPOLIS" (maiúsculo) e
    -- lojas.nome grava "Petrópolis" (capitalizado). Sem normalizar, a MESMA loja
    -- vira duas linhas no ranking. (Mesma normalização que o RPC das metas usa.)
    select upper(trim(regexp_replace(coalesce(loja, ''), 'TECNOCELL ', '', 'i'))) as k,
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
