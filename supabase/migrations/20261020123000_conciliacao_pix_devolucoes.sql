-- LOCAL: aplicar separadamente somente após revisão/homologação. Sem backfill financeiro.
-- Mantém entrada automática sem conta_id: lib/saldos-contas soma pagamentos_venda.
begin;
alter table public.devolucoes
  add column caixa_id uuid references public.caixas(id),
  add column abate_fiado numeric,
  add column reembolsos jsonb;
alter table public.lancamentos add column devolucao_id uuid references public.devolucoes(id);
create index idx_devolucoes_caixa on public.devolucoes(caixa_id) where caixa_id is not null;
create index idx_lancamentos_devolucao on public.lancamentos(devolucao_id) where devolucao_id is not null;

create function public.conta_pix_da_venda(p_venda uuid) returns uuid
language plpgsql set search_path = '' as $$
declare v_conta uuid; v_contas uuid[]; v_explicitas uuid[]; v_sem_rota boolean;
begin
  -- Quitação posterior (F9) pode ter conta explícita que deve ser preservada.
  select array_agg(distinct conta_id) into v_explicitas from public.lancamentos
    where venda_id=p_venda and tipo='receber' and status='pago'
      and forma_pagamento ilike '%pix%' and conta_id is not null;
  -- Mesma precedência do saldo do PDV: rota forma/loja, depois destino da forma.
  select array_agg(distinct coalesce(r.conta_id,f.conta_destino_id)),
    bool_or(coalesce(r.conta_id,f.conta_destino_id) is null)
    into v_contas,v_sem_rota
  from public.pagamentos_venda pv
  join public.formas_pagamento f on f.id=pv.forma_pagamento_id and f.tipo='pix'
  join public.vendas v on v.id=pv.venda_id
  join public.depositos d on d.id=v.deposito_id
  left join public.forma_conta_loja r on r.forma_id=f.id and r.loja_id=d.loja_id
  where pv.venda_id=p_venda and pv.status='pago';
  select array_agg(distinct c) into v_contas
    from unnest(coalesce(v_contas,'{}'::uuid[]) || coalesce(v_explicitas,'{}'::uuid[])) c where c is not null;
  if cardinality(v_contas)>1 or (cardinality(v_contas)>0 and v_sem_rota) then
    raise exception 'Pix recebido em contas diferentes. Escolha a conta no reembolso dividido.';
  end if;
  v_conta := v_contas[1];
  if v_conta is not null and not exists(select 1 from public.contas where id=v_conta and ativa is true) then
    raise exception 'Conta de reembolso inexistente ou inativa.';
  end if;
  return v_conta; -- sem configuração: conserva NULL; não inventa conta por nome.
end;
$$;
revoke all on function public.conta_pix_da_venda(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.registrar_devolucao(p_venda_id uuid, p_deposito_id text, p_pessoa_id text, p_pessoa_nome text, p_vendedor_nome text, p_motivo text, p_tipo_credito text, p_itens jsonb, p_lancamento_pendente boolean, p_series jsonb DEFAULT '[]'::jsonb, p_reembolsos jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
declare
  v_devolucao_id   uuid := gen_random_uuid();
  v_valor_total    numeric := 0;
  v_item           jsonb;
  v_s              jsonb;
  v_deposito       text;
  v_loja_id        uuid;
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
  v_caixa_id       uuid;
  v_registro       jsonb;
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
    select sum(total_item) / nullif(sum(quantidade), 0) * coalesce((select greatest(0, 1 - coalesce(v.desconto,0) / nullif((select sum(x.total_item) from public.itens_venda x where x.venda_id = p_venda_id),0)) from public.vendas v where v.id = p_venda_id),1) as preco_medio
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
  select loja_id into v_loja_id from depositos where id = v_deposito;

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
    select sum(total_item) / nullif(sum(quantidade), 0) * coalesce((select greatest(0, 1 - coalesce(v.desconto,0) / nullif((select sum(x.total_item) from public.itens_venda x where x.venda_id = p_venda_id),0)) from public.vendas v where v.id = p_venda_id),1) as preco_medio
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

  -- FOR UPDATE: trava a linha do fiado — sem isso, recebimento e devolução
  -- concorrentes liam o mesmo valor_pago e o cliente podia pagar e perder.
  select id, (valor - coalesce(valor_pago, 0))
  into v_fiado_lanc_id, v_fiado_restante
  from lancamentos
  where venda_id = p_venda_id and status = 'pendente' and tipo = 'receber'
  order by created_at limit 1
  for update;

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

  -- A entrada é contabilizada por pagamentos_venda. Só o reembolso recebe conta_id.
  if v_reembolso > 0.005 and p_tipo_credito = 'pix' and
      (p_reembolsos is null or jsonb_array_length(p_reembolsos) = 0) then
    p_reembolsos := jsonb_build_array(jsonb_build_object('tipo','pix','valor',v_reembolso,
      'conta_id',public.conta_pix_da_venda(p_venda_id)));
  end if;

  v_registro := '[]'::jsonb;
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
        if v_tipo_r = 'pix' and v_conta_r is null then
          v_conta_r := public.conta_pix_da_venda(p_venda_id);
        end if;
        if v_conta_r is not null and not exists(select 1 from public.contas where id=v_conta_r and ativa is true) then
          raise exception 'Conta de reembolso inexistente ou inativa.';
        end if;
        if v_valor_r <= 0.005 then continue; end if;
        v_registro := v_registro || jsonb_build_array(jsonb_build_object(
          'tipo',v_tipo_r,'valor',v_valor_r,'conta_id',v_conta_r));

        if v_tipo_r = 'credito_conta' then
          if p_pessoa_id is not null then
            insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id, loja_id)
            values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_valor_r, 'credito', 'Devolução de compra', v_devolucao_id, v_loja_id);
          end if;
        elsif v_tipo_r = 'dinheiro' then
          -- dinheiro sai da GAVETA (movimento de caixa, registrado na action)
          v_reemb_dinheiro := v_reemb_dinheiro + v_valor_r;
        elsif v_tipo_r not in ('sem_reembolso', 'cancelamento_fiado') then
          insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, conta_id, loja_id, updated_at, devolucao_id)
          values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_valor_r, 'pagar', v_today, v_today, 'pago', v_today, v_tipo_r, p_pessoa_nome, v_conta_r, v_loja_id, v_now, v_devolucao_id);
        end if;
      end loop;

    -- ═══ MODO ANTIGO: uma forma só (segue idêntico) ═══
    else
      if p_tipo_credito = 'credito_conta' then
        if p_pessoa_id is not null then
          insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id, loja_id)
          values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'credito', 'Devolução de compra', v_devolucao_id, v_loja_id);
        end if;
      elsif p_tipo_credito = 'dinheiro' then
        v_reemb_dinheiro := v_reembolso;
      elsif p_tipo_credito not in ('sem_reembolso', 'cancelamento_fiado') then
        insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, loja_id, updated_at, devolucao_id)
        values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'pagar', v_today, v_today, 'pago', v_today, p_tipo_credito, p_pessoa_nome, v_loja_id, v_now, v_devolucao_id);
      end if;
    end if;
  end if;

  select id into v_caixa_id from public.caixas
    where loja_id=v_loja_id and status='aberto' order by aberto_em desc limit 1 for share;
  if v_reembolso > 0.005 and jsonb_array_length(v_registro)=0 then
    v_registro := jsonb_build_array(jsonb_build_object('tipo',p_tipo_credito,'valor',v_reembolso));
  end if;
  update public.devolucoes set caixa_id=v_caixa_id,abate_fiado=v_abate_fiado,reembolsos=v_registro
    where id=v_devolucao_id;

  return jsonb_build_object(
    'devolucao_id', v_devolucao_id,
    'abate_fiado', v_abate_fiado,
    'reembolso', v_reembolso,
    'reembolso_dinheiro', v_reemb_dinheiro
  );
end;
$function$;
commit;
