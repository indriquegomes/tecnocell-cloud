CREATE OR REPLACE FUNCTION public.registrar_devolucao(p_venda_id uuid, p_deposito_id text, p_pessoa_id text, p_pessoa_nome text, p_vendedor_nome text, p_motivo text, p_tipo_credito text, p_itens jsonb, p_lancamento_pendente boolean, p_series jsonb DEFAULT '[]'::jsonb, p_reembolsos jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_devolucao_id   uuid := gen_random_uuid();
  v_valor_total    numeric := 0;
  v_item           jsonb;
  v_s              jsonb;
  v_deposito       text;
  v_estoque_id     uuid;
  v_reaproveitavel boolean;
  v_today          date := (now() at time zone 'America/Sao_Paulo')::date;
  v_now            timestamptz := now();
  v_fiado_lanc_id  text;
  v_fiado_restante numeric;
  v_abate_fiado    numeric := 0;
  v_reembolso      numeric := 0;
  v_vendido        numeric;
  v_ja_devolvido   numeric;
  v_r              jsonb;
  v_soma_reemb     numeric := 0;
  v_reemb_dinheiro numeric := 0;
  v_tipo_r         text;
  v_valor_r        numeric;
  v_conta_r        uuid;
begin
  perform 1 from vendas where id = p_venda_id for update;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if (v_item->>'quantidade')::numeric <= 0 then
      raise exception 'Quantidade de devolução inválida para "%": %',
        coalesce(v_item->>'nome', v_item->>'produto_id'), v_item->>'quantidade';
    end if;

    select coalesce(sum(quantidade), 0) into v_vendido
    from itens_venda
    where venda_id = p_venda_id and produto_id = (v_item->>'produto_id');

    select coalesce(sum(idv.quantidade), 0) into v_ja_devolvido
    from itens_devolucao idv
    join devolucoes d on d.id = idv.devolucao_id
    where d.venda_id = p_venda_id and idv.produto_id = (v_item->>'produto_id');

    if v_ja_devolvido + (v_item->>'quantidade')::numeric > v_vendido + 0.001 then
      raise exception 'Não dá para devolver % de "%": foram vendidas % e já devolvidas % (restam %).',
        (v_item->>'quantidade')::numeric,
        coalesce(v_item->>'nome', v_item->>'produto_id'),
        v_vendido, v_ja_devolvido, greatest(v_vendido - v_ja_devolvido, 0);
    end if;
  end loop;

  -- ═══ VALOR REAL — nunca confia no total_item/preco_unitario do chamador ═══
  select coalesce(sum(round(coalesce(iv.preco_medio, 0) * (item->>'quantidade')::numeric, 2)), 0)
  into v_valor_total
  from jsonb_array_elements(p_itens) as item
  left join lateral (
    select sum(total_item) / nullif(sum(quantidade), 0) as preco_medio
    from itens_venda
    where venda_id = p_venda_id and produto_id = item->>'produto_id'
  ) iv on true;

  v_deposito := p_deposito_id;
  if v_deposito is null then
    select id into v_deposito from depositos order by nome limit 1;
  end if;
  if v_deposito is null then
    raise exception 'Nenhum depósito cadastrado para retornar o estoque.';
  end if;

  insert into devolucoes (id, venda_id, deposito_id, pessoa_nome, vendedor_nome, motivo, valor_total, tipo_credito, status)
  values (v_devolucao_id, p_venda_id, v_deposito, coalesce(p_pessoa_nome, 'Cliente Final'),
          p_vendedor_nome, nullif(p_motivo, ''), v_valor_total, p_tipo_credito, 'concluida');

  insert into itens_devolucao (devolucao_id, produto_id, nome, quantidade, preco_unitario, total_item, status_produto)
  select v_devolucao_id, item->>'produto_id', item->>'nome', (item->>'quantidade')::numeric,
         round(coalesce(iv.preco_medio, 0), 2),
         round(coalesce(iv.preco_medio, 0) * (item->>'quantidade')::numeric, 2),
         coalesce(item->>'status_produto', 'ok')
  from jsonb_array_elements(p_itens) as item
  left join lateral (
    select sum(total_item) / nullif(sum(quantidade), 0) as preco_medio
    from itens_venda
    where venda_id = p_venda_id and produto_id = item->>'produto_id'
  ) iv on true;

  -- retorno ao estoque — só 'ok' volta ao vendável
  for v_item in select * from jsonb_array_elements(p_itens) loop
    if exists (select 1 from jsonb_array_elements(p_series) s where s->>'produto_id' = v_item->>'produto_id') then
      continue;
    end if;
    if coalesce(v_item->>'status_produto', 'ok') <> 'ok' then
      continue;
    end if;
    select id into v_estoque_id from estoque
    where produto_id = (v_item->>'produto_id') and deposito_id = v_deposito
    for update;
    if found then
      update estoque set quantidade = quantidade + (v_item->>'quantidade')::numeric, updated_at = v_now where id = v_estoque_id;
    else
      insert into estoque (produto_id, deposito_id, quantidade)
      values (v_item->>'produto_id', v_deposito, (v_item->>'quantidade')::numeric);
    end if;
  end loop;

  for v_s in select * from jsonb_array_elements(p_series) loop
    v_reaproveitavel := (coalesce(v_s->>'status_produto', 'ok') = 'ok');
    update numeros_serie
      set status     = case when v_reaproveitavel then 'em_estoque' else 'defeito' end,
          venda_id   = null,
          deposito_id = v_deposito,
          updated_at = v_now
    where produto_id = (v_s->>'produto_id') and serie = (v_s->>'serie')
      and venda_id = p_venda_id::text and status = 'vendido';
    if not found then
      raise exception 'IMEI % não consta como vendido nesta venda', v_s->>'serie';
    end if;
    if v_reaproveitavel then
      select id into v_estoque_id from estoque
      where produto_id = (v_s->>'produto_id') and deposito_id = v_deposito
      for update;
      if found then
        update estoque set quantidade = quantidade + 1, updated_at = v_now where id = v_estoque_id;
      else
        insert into estoque (produto_id, deposito_id, quantidade) values (v_s->>'produto_id', v_deposito, 1);
      end if;
    end if;
  end loop;

  select id, (valor - coalesce(valor_pago, 0))
  into v_fiado_lanc_id, v_fiado_restante
  from lancamentos
  where venda_id = p_venda_id and status = 'pendente' and tipo = 'receber'
  order by created_at limit 1;

  v_fiado_restante := coalesce(v_fiado_restante, 0);
  v_abate_fiado    := least(v_valor_total, greatest(v_fiado_restante, 0));
  v_reembolso      := v_valor_total - v_abate_fiado;

  if v_abate_fiado > 0.005 and v_fiado_lanc_id is not null then
    if v_fiado_restante - v_abate_fiado <= 0.01 then
      update lancamentos set status = 'cancelado', updated_at = v_now where id = v_fiado_lanc_id;
    else
      update lancamentos set valor = round(valor - v_abate_fiado, 2), updated_at = v_now where id = v_fiado_lanc_id;
    end if;
  end if;

  if v_reembolso > 0.005 then
    -- ═══ MODO MISTO: várias formas de reembolso numa devolução só ═══
    if p_reembolsos is not null and jsonb_array_length(p_reembolsos) > 0 then
      select coalesce(sum((r->>'valor')::numeric), 0) into v_soma_reemb
      from jsonb_array_elements(p_reembolsos) as r;

      if exists (select 1 from jsonb_array_elements(p_reembolsos) as r where (r->>'valor')::numeric < 0) then
        raise exception 'Reembolso com valor negativo não é permitido';
      end if;

      if abs(v_soma_reemb - v_reembolso) > 0.01 then
        raise exception 'As formas de reembolso não fecham: somaram R$ %, mas o reembolso é R$ %',
          round(v_soma_reemb, 2), round(v_reembolso, 2);
      end if;

      for v_r in select * from jsonb_array_elements(p_reembolsos) loop
        v_tipo_r  := v_r->>'tipo';
        v_valor_r := (v_r->>'valor')::numeric;
        v_conta_r := nullif(v_r->>'conta_id', '')::uuid;
        if v_valor_r <= 0.005 then continue; end if;

        if v_tipo_r = 'credito_conta' then
          if p_pessoa_id is not null then
            insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id)
            values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_valor_r, 'credito', 'Devolução de compra', v_devolucao_id);
          end if;
        elsif v_tipo_r = 'dinheiro' then
          -- dinheiro sai da GAVETA (movimento de caixa, registrado na action)
          v_reemb_dinheiro := v_reemb_dinheiro + v_valor_r;
        elsif v_tipo_r not in ('sem_reembolso', 'cancelamento_fiado') then
          insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, conta_id, updated_at)
          values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_valor_r, 'pagar', v_today, v_today, 'pago', v_today, v_tipo_r, p_pessoa_nome, v_conta_r, v_now);
        end if;
      end loop;

    -- ═══ MODO ANTIGO: uma forma só (segue idêntico) ═══
    else
      if p_tipo_credito = 'credito_conta' then
        if p_pessoa_id is not null then
          insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id)
          values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'credito', 'Devolução de compra', v_devolucao_id);
        end if;
      elsif p_tipo_credito = 'dinheiro' then
        v_reemb_dinheiro := v_reembolso;
      elsif p_tipo_credito not in ('sem_reembolso', 'cancelamento_fiado') then
        insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, updated_at)
        values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'pagar', v_today, v_today, 'pago', v_today, p_tipo_credito, p_pessoa_nome, v_now);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'devolucao_id', v_devolucao_id,
    'abate_fiado', v_abate_fiado,
    'reembolso', v_reembolso,
    'reembolso_dinheiro', v_reemb_dinheiro
  );
end;
$function$
;
