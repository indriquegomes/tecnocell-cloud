-- Acelera o relatório de Lucro Mensal: agrega no BANCO em uma consulta só,
-- em vez de baixar 70.914 itens de venda + 7.360 vendas + 8.153 produtos pra somar
-- no JS (era ~92 requisições por tela, ~14s). Mesma regra do código antigo
-- (relatorioLucroMensal), resultado idêntico — validado por diff JS antigo × RPC.
create or replace function relatorio_lucro_mensal()
returns table (
  mes text,
  loja_id text,
  loja_nome text,
  faturamento numeric,
  custo_vendido numeric,
  compras numeric,
  ciclo1 numeric,
  ciclo2 numeric,
  ciclo3 numeric,
  tem_itens boolean
)
language sql
stable
as $$
  with vendas_ok as (
    select id, deposito_id, created_at, total
    from vendas
    where status = 'concluida'
      and uso_interno = false
      and numero < 100000
      -- equivale ao dataValida do JS (/^20\d{2}-/): ano 2000-2099, rejeita placeholder 1899 e null
      and created_at >= '2000-01-01'::timestamptz
      and created_at < '2100-01-01'::timestamptz
  ),
  fat as (
    select
      to_char(v.created_at at time zone 'UTC', 'YYYY-MM') as mes,
      coalesce(d.loja_id::text, v.deposito_id) as loja_id,
      coalesce(l.nome, d.nome, 'Sem loja') as loja_nome,
      sum(coalesce(v.total, 0)) as faturamento
    from vendas_ok v
    left join depositos d on d.id = v.deposito_id
    left join lojas l on l.id = d.loja_id
    group by 1, 2, 3
  ),
  custo as (
    select
      to_char(v.created_at at time zone 'UTC', 'YYYY-MM') as mes,
      coalesce(d.loja_id::text, v.deposito_id) as loja_id,
      coalesce(l.nome, d.nome, 'Sem loja') as loja_nome,
      sum(coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0)) as custo_vendido,
      sum(case when extract(day from v.created_at at time zone 'UTC') <= 10
            then coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0) else 0 end) as ciclo1,
      sum(case when extract(day from v.created_at at time zone 'UTC') between 11 and 20
            then coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0) else 0 end) as ciclo2,
      sum(case when extract(day from v.created_at at time zone 'UTC') >= 21
            then coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0) else 0 end) as ciclo3
    from vendas_ok v
    join itens_venda i on i.venda_id = v.id
    left join produtos p on p.id = i.produto_id
    left join depositos d on d.id = v.deposito_id
    left join lojas l on l.id = d.loja_id
    group by 1, 2, 3
  ),
  compras_agg as (
    select
      substr(coalesce(n.data_entrada::text, ''), 1, 7) as mes,
      coalesce(d.loja_id::text, it.deposito_id) as loja_id,
      coalesce(l.nome, d.nome, 'Sem loja') as loja_nome,
      sum(coalesce(it.total_item, 0)) as compras
    from itens_nota_entrada it
    join notas_entrada n on n.id = it.nota_id
    left join depositos d on d.id = it.deposito_id
    left join lojas l on l.id = d.loja_id
    where n.status is distinct from 'cancelada'
    group by 1, 2, 3
  ),
  keys as (
    select mes, loja_id from fat
    union
    select mes, loja_id from custo
    union
    select mes, loja_id from compras_agg
  )
  select
    k.mes,
    k.loja_id,
    coalesce(f.loja_nome, c.loja_nome, cp.loja_nome, 'Sem loja') as loja_nome,
    coalesce(f.faturamento, 0) as faturamento,
    coalesce(c.custo_vendido, 0) as custo_vendido,
    coalesce(cp.compras, 0) as compras,
    coalesce(c.ciclo1, 0) as ciclo1,
    coalesce(c.ciclo2, 0) as ciclo2,
    coalesce(c.ciclo3, 0) as ciclo3,
    (c.mes is not null) as tem_itens
  from keys k
  left join fat f on f.mes = k.mes and f.loja_id is not distinct from k.loja_id
  left join custo c on c.mes = k.mes and c.loja_id is not distinct from k.loja_id
  left join compras_agg cp on cp.mes = k.mes and cp.loja_id is not distinct from k.loja_id
  order by k.mes, k.loja_id;
$$;
