-- ============================================================================
-- CUSTO TRAVADO NA VENDA (para o CMV parar de mudar quando alguem ajusta custo)
-- 04/11/2026 — pedido do dono.
--
-- Problema: o CMV era calculado na hora da leitura usando produtos.preco_custo.
-- Ajustar o custo de uma peca hoje reescrevia o CMV de outubro na tela.
--
-- Correcao: cada item de venda passa a guardar o custo do momento da venda.
-- O CMV dos relatorios le esse valor. Mudar custo afeta so o futuro.
--
-- Esta migration:
--   1) cria a coluna itens_venda.custo_unitario
--   2) preenche as vendas antigas com o custo ATUAL do produto (uma vez so)
--   3) reescreve finalizar_venda gravando o custo na venda
--      (corpo copiado de 20261027200000_finalizar_venda_fiado_com_pessoa.sql,
--       unica diferenca: a coluna nova no insert de itens_venda)
-- ============================================================================

alter table public.itens_venda add column if not exists custo_unitario numeric(12,2);

update public.itens_venda iv
   set custo_unitario = coalesce(p.preco_custo, 0)
  from public.produtos p
 where p.id = iv.produto_id
   and iv.custo_unitario is null;

-- ============================================================================
-- finalizar_venda — nota de fiado nasce com pessoa_id e nota "Venda #" nasce
-- classificada, com loja e com valor_pago. (27/10/2026, autorizado pelo dono)
--
-- Por quê:
--   • o fiado era gravado com pessoa_nome mas SEM pessoa_id — a nota não ficava
--     presa ao cadastro do cliente (é a origem das 3.349 notas antigas sem vínculo);
--   • a nota "Venda #" nascia sem categoria, sem subcategoria, sem loja_id e sem
--     valor_pago — daí as vendas caírem em "Sem categoria" e entrarem na conta dos
--     1.447 pagos com valor pago vazio.
--
-- O QUE MUDA (e só isso, 4 linhas de SQL):
--   1. insert da "Venda #": + valor_pago (v_pago_total), + categoria 'Vendas',
--      + subcategoria 'Loja', + loja_id (v_loja_id);
--   2. insert do fiado: + pessoa_id (p_pessoa_id), + categoria 'Fiado (a receber)',
--      + loja_id (v_loja_id).
-- Nada mais foi tocado: valores, trava de soma, estoque, pagamentos, crédito e
-- devolução seguem byte a byte iguais (corpo copiado de pg_get_functiondef()).
--
-- Corpo antigo guardado em:
--   Documents/backups-tecnocell/2026-10-27/scripts/finalizar_venda-def-ATUAL.sql
-- Reversão: rodar aquele arquivo de volta.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalizar_venda(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb DEFAULT '[]'::jsonb, p_vendedor_id uuid DEFAULT NULL::uuid, p_vendedor_nome text DEFAULT NULL::text, p_credito_valor numeric DEFAULT 0, p_tipo_entrega text DEFAULT 'retirada'::text, p_endereco_entrega text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_subtotal           numeric := 0;
  v_total_produtos     numeric;
  v_total_taxas        numeric := 0;
  v_total              numeric;
  v_forma_pag_id       text;
  v_venda_id           uuid;
  v_venda_numero       integer;
  v_item               jsonb;
  v_pag                jsonb;
  v_estoque_id         uuid;
  v_qtd_disponivel     numeric;
  v_nova_qtd           numeric;
  v_pago_total         numeric := 0;
  v_fiado_total        numeric := 0;
  v_pessoa_nome        text;
  v_saldo_credito      numeric;
  v_loja_id            uuid;
  v_today              date;
  v_now                timestamptz;
  v_estoque_atualizado jsonb := '{}'::jsonb;
  v_soma_pagamentos    numeric := 0;
  v_permite_negativo   boolean;
begin
  v_today := (now() at time zone 'America/Sao_Paulo')::date;
  v_now   := now();

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_subtotal := v_subtotal + (v_item->>'quantidade')::numeric * (v_item->>'preco_unitario')::numeric;
  end loop;

  v_total_produtos := greatest(0, v_subtotal - p_desconto);

  for v_pag in select * from jsonb_array_elements(p_pagamentos) loop
    v_total_taxas := v_total_taxas + (v_pag->>'taxa')::numeric;
  end loop;

  v_total := v_total_produtos + v_total_taxas;

  select coalesce(sum((pag->>'valor')::numeric), 0) into v_soma_pagamentos
  from jsonb_array_elements(p_pagamentos) as pag;

  if exists (select 1 from jsonb_array_elements(p_pagamentos) as pag
             where (pag->>'valor')::numeric < 0 or (pag->>'taxa')::numeric < 0) then
    raise exception 'Pagamento com valor ou taxa negativa não é permitido';
  end if;
  if coalesce(p_credito_valor, 0) < 0 then
    raise exception 'Crédito com valor negativo não é permitido';
  end if;

  if abs((v_soma_pagamentos + coalesce(p_credito_valor, 0)) - v_total_produtos) > 0.01 then
    raise exception 'Os pagamentos não fecham com a venda: pagamentos R$ % + crédito R$ % = R$ %, mas a venda é R$ %',
      round(v_soma_pagamentos, 2),
      round(coalesce(p_credito_valor, 0), 2),
      round(v_soma_pagamentos + coalesce(p_credito_valor, 0), 2),
      round(v_total_produtos, 2);
  end if;

  if jsonb_array_length(p_pagamentos) = 1 then
    v_forma_pag_id := p_pagamentos->0->>'forma_pagamento_id';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    -- Item avulso (sem produto cadastrado): não tem estoque pra baixar
    if nullif(v_item->>'produto_id', '') is null then
      continue;
    end if;

    select id, quantidade into v_estoque_id, v_qtd_disponivel
    from estoque
    where deposito_id = p_deposito_id and produto_id = (v_item->>'produto_id')
    for update;

    if not found then
      raise exception 'Produto "%" não encontrado no estoque do depósito', v_item->>'nome';
    end if;
    select permite_estoque_negativo into v_permite_negativo from produtos where id = (v_item->>'produto_id');
    if not coalesce(v_permite_negativo, false) and v_qtd_disponivel < (v_item->>'quantidade')::numeric then
      raise exception 'Estoque insuficiente para "%" (disponível: %)', v_item->>'nome', v_qtd_disponivel;
    end if;

    v_nova_qtd := v_qtd_disponivel - (v_item->>'quantidade')::numeric;
    update estoque set quantidade = v_nova_qtd, updated_at = v_now where id = v_estoque_id;
    v_estoque_atualizado := v_estoque_atualizado || jsonb_build_object(v_item->>'produto_id', v_nova_qtd);
  end loop;

  v_venda_numero := nextval('venda_numero_seq');

  insert into vendas (numero, total, desconto, forma_pagamento_id, pessoa_id, observacoes, status, deposito_id, vendedor_id, vendedor_nome, tipo_entrega, endereco_entrega)
  values (v_venda_numero, v_total, p_desconto, v_forma_pag_id, p_pessoa_id, nullif(p_observacoes, ''), 'concluida', p_deposito_id, p_vendedor_id, p_vendedor_nome, coalesce(p_tipo_entrega, 'retirada'), nullif(p_endereco_entrega, ''))
  returning id into v_venda_id;

  -- custo_unitario: CUSTO TRAVADO NA VENDA. O CMV passa a ler este valor, e nao
  -- mais o preco_custo atual do cadastro — assim ajustar custo hoje nao reescreve
  -- o resultado de mes ja fechado.
  insert into itens_venda (venda_id, produto_id, nome, quantidade, preco_unitario, desconto_item, total_item, custo_unitario)
  select v_venda_id,
         nullif(item->>'produto_id', ''),
         case when nullif(item->>'produto_id', '') is null then nullif(item->>'nome', '') else null end,
         (item->>'quantidade')::numeric, (item->>'preco_unitario')::numeric,
         0, (item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric,
         coalesce((select p.preco_custo from produtos p where p.id = nullif(item->>'produto_id', '')), 0)
  from jsonb_array_elements(p_itens) as item;

  select loja_id into v_loja_id from depositos where id = p_deposito_id;

  if p_credito_valor > 0 and p_pessoa_id is not null then
    perform 1 from pessoas where id = p_pessoa_id for update;
    select coalesce(sum(case when tipo in ('uso', 'estorno') then -valor else valor end), 0) into v_saldo_credito
    from creditos_clientes where pessoa_id = p_pessoa_id and loja_id = v_loja_id;
    if v_saldo_credito < p_credito_valor then
      raise exception 'Saldo de crédito insuficiente nesta loja (disponível: %)', v_saldo_credito;
    end if;
    select nome into v_pessoa_nome from pessoas where id = p_pessoa_id;
    insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, venda_id, loja_id)
    values (p_pessoa_id, v_pessoa_nome, p_credito_valor, 'uso', 'Usado na venda #' || v_venda_numero, v_venda_id::text, v_loja_id);

    insert into pagamentos_venda (venda_id, forma_pagamento_id, valor, taxa, maquina, parcelas, status)
    values (v_venda_id, 'FP_VALE', p_credito_valor, 0, null, 1, 'vale');
  end if;

  if jsonb_array_length(coalesce(p_series, '[]'::jsonb)) > 0 then
    for v_item in select * from jsonb_array_elements(p_series) loop
      update numeros_serie
      set status = 'vendido', venda_id = v_venda_id::text, updated_at = v_now
      where produto_id = (v_item->>'produto_id')
        and serie = (v_item->>'serie')
        and deposito_id = p_deposito_id
        and status = 'em_estoque';
      if not found then
        raise exception 'IMEI % indisponível no estoque deste depósito', v_item->>'serie';
      end if;
    end loop;
  end if;

  insert into pagamentos_venda (venda_id, forma_pagamento_id, valor, taxa, maquina, parcelas, status)
  select v_venda_id, pag->>'forma_pagamento_id', (pag->>'valor')::numeric, (pag->>'taxa')::numeric,
         nullif(pag->>'maquina', ''), (pag->>'parcelas')::int, pag->>'status'
  from jsonb_array_elements(p_pagamentos) as pag;

  select
    coalesce(sum(case when pag->>'status' = 'pago' then (pag->>'valor')::numeric + (pag->>'taxa')::numeric else 0 end), 0),
    coalesce(sum(case when pag->>'status' = 'pendente' then (pag->>'valor')::numeric else 0 end), 0)
  into v_pago_total, v_fiado_total
  from jsonb_array_elements(p_pagamentos) as pag;

  if v_pago_total > 0 then
    insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, valor_pago, categoria, subcategoria, loja_id, updated_at, venda_id)
    values ('Venda #' || v_venda_numero, v_pago_total, 'receber', v_today, v_today, 'pago', v_today, v_pago_total, 'Vendas', 'Loja', v_loja_id, v_now, v_venda_id);
  end if;

  if v_fiado_total > 0 then
    if p_pessoa_id is not null then
      select nome into v_pessoa_nome from pessoas where id = p_pessoa_id;
    end if;
    insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, pessoa_id, pessoa_nome, categoria, loja_id, updated_at, venda_id)
    values ('A Receber — Fiado #' || v_venda_numero, v_fiado_total, 'receber', v_today, v_today, 'pendente', p_pessoa_id, v_pessoa_nome, 'Fiado (a receber)', v_loja_id, v_now, v_venda_id);
  end if;

  return jsonb_build_object(
    'venda_id', v_venda_id, 'venda_numero', v_venda_numero,
    'total', v_total, 'estoque_atualizado', v_estoque_atualizado
  );
end;
$function$;

-- ============================================================================
-- relatorio_lucro_mensal(): custo vendido passa a ler o custo TRAVADO na venda.
-- Corpo copiado de 2026-10-18_lucro-mensal-rpc.sql; unica diferenca: as 4 somas
-- de custo usam i.custo_unitario (com fallback no preco_custo do cadastro).
-- ============================================================================

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
      to_char(v.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
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
      to_char(v.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
      coalesce(d.loja_id::text, v.deposito_id) as loja_id,
      coalesce(l.nome, d.nome, 'Sem loja') as loja_nome,
      sum(coalesce(i.quantidade, 0) * coalesce(i.custo_unitario, p.preco_custo, 0)) as custo_vendido,
      sum(case when extract(day from v.created_at at time zone 'America/Sao_Paulo') <= 10
            then coalesce(i.quantidade, 0) * coalesce(i.custo_unitario, p.preco_custo, 0) else 0 end) as ciclo1,
      sum(case when extract(day from v.created_at at time zone 'America/Sao_Paulo') between 11 and 20
            then coalesce(i.quantidade, 0) * coalesce(i.custo_unitario, p.preco_custo, 0) else 0 end) as ciclo2,
      sum(case when extract(day from v.created_at at time zone 'America/Sao_Paulo') >= 21
            then coalesce(i.quantidade, 0) * coalesce(i.custo_unitario, p.preco_custo, 0) else 0 end) as ciclo3
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
