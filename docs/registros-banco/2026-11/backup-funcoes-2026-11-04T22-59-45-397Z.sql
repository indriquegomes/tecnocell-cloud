-- finalizar_venda
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
  v_eh_servico         boolean;
begin
  v_today := (now() at time zone 'America/Sao_Paulo')::date;
  v_now   := now();

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if (v_item->>'quantidade')::numeric <> trunc((v_item->>'quantidade')::numeric) then
      raise exception 'Quantidade precisa ser numero inteiro (veio "%") em "%"',
        v_item->>'quantidade', coalesce(v_item->>'nome', v_item->>'produto_id');
    end if;
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
    raise exception 'Pagamento com valor ou taxa negativa nao e permitido';
  end if;
  if coalesce(p_credito_valor, 0) < 0 then
    raise exception 'Credito com valor negativo nao e permitido';
  end if;

  if abs((v_soma_pagamentos + coalesce(p_credito_valor, 0)) - v_total_produtos) > 0.01 then
    raise exception 'Os pagamentos nao fecham com a venda: pagamentos R$ % + credito R$ % = R$ %, mas a venda e R$ %',
      round(v_soma_pagamentos, 2),
      round(coalesce(p_credito_valor, 0), 2),
      round(v_soma_pagamentos + coalesce(p_credito_valor, 0), 2),
      round(v_total_produtos, 2);
  end if;

  if jsonb_array_length(p_pagamentos) = 1 then
    v_forma_pag_id := p_pagamentos->0->>'forma_pagamento_id';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if nullif(v_item->>'produto_id', '') is null then
      continue;
    end if;

    select servico into v_eh_servico from produtos where id = (v_item->>'produto_id');
    if coalesce(v_eh_servico, false) then
      continue;
    end if;

    select id, quantidade into v_estoque_id, v_qtd_disponivel
    from estoque
    where deposito_id = p_deposito_id and produto_id = (v_item->>'produto_id')
    for update;

    if not found then
      raise exception 'Produto "%" nao encontrado no estoque do deposito', v_item->>'nome';
    end if;
    select permite_estoque_negativo into v_permite_negativo from produtos where id = (v_item->>'produto_id');
    if not coalesce(v_permite_negativo, false) and v_qtd_disponivel < (v_item->>'quantidade')::numeric then
      raise exception 'Estoque insuficiente para "%" (disponivel: %)', v_item->>'nome', v_qtd_disponivel;
    end if;

    v_nova_qtd := v_qtd_disponivel - (v_item->>'quantidade')::numeric;
    update estoque set quantidade = v_nova_qtd, updated_at = v_now where id = v_estoque_id;
    v_estoque_atualizado := v_estoque_atualizado || jsonb_build_object(v_item->>'produto_id', v_nova_qtd);
  end loop;

  v_venda_numero := nextval('venda_numero_seq');

  insert into vendas (numero, total, desconto, forma_pagamento_id, pessoa_id, observacoes, status, deposito_id, vendedor_id, vendedor_nome, tipo_entrega, endereco_entrega)
  values (v_venda_numero, v_total, p_desconto, v_forma_pag_id, p_pessoa_id, nullif(p_observacoes, ''), 'concluida', p_deposito_id, p_vendedor_id, p_vendedor_nome, coalesce(p_tipo_entrega, 'retirada'), nullif(p_endereco_entrega, ''))
  returning id into v_venda_id;

  insert into itens_venda (venda_id, produto_id, nome, quantidade, preco_unitario, desconto_item, total_item)
  select v_venda_id,
         nullif(item->>'produto_id', ''),
         case when nullif(item->>'produto_id', '') is null then nullif(item->>'nome', '') else null end,
         (item->>'quantidade')::numeric, (item->>'preco_unitario')::numeric,
         0, (item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  select loja_id into v_loja_id from depositos where id = p_deposito_id;

  if p_credito_valor > 0 and p_pessoa_id is not null then
    perform 1 from pessoas where id = p_pessoa_id for update;
    select coalesce(sum(case when tipo in ('uso', 'estorno') then -valor else valor end), 0) into v_saldo_credito
    from creditos_clientes where pessoa_id = p_pessoa_id and loja_id = v_loja_id;
    if v_saldo_credito < p_credito_valor then
      raise exception 'Saldo de credito insuficiente nesta loja (disponivel: %)', v_saldo_credito;
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
        raise exception 'IMEI % indisponivel no estoque deste deposito', v_item->>'serie';
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
$function$


-- relatorio_lucro_mensal
CREATE OR REPLACE FUNCTION public.relatorio_lucro_mensal()
 RETURNS TABLE(mes text, loja_id text, loja_nome text, faturamento numeric, custo_vendido numeric, compras numeric, ciclo1 numeric, ciclo2 numeric, ciclo3 numeric, tem_itens boolean)
 LANGUAGE sql
 STABLE
AS $function$
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
      sum(coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0)) as custo_vendido,
      sum(case when extract(day from v.created_at at time zone 'America/Sao_Paulo') <= 10
            then coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0) else 0 end) as ciclo1,
      sum(case when extract(day from v.created_at at time zone 'America/Sao_Paulo') between 11 and 20
            then coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0) else 0 end) as ciclo2,
      sum(case when extract(day from v.created_at at time zone 'America/Sao_Paulo') >= 21
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
$function$

