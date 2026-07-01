-- ============================================================
-- Devolução atômica — pendências #1 e #2 (pós-conselho)
--
-- #2  devolucoes.deposito_id: uuid -> text (os ids de depósito são TEXT/SIGE;
--     a coluna uuid nunca recebia valor válido e ficava sempre null). Agora a
--     devolução registra de qual depósito o estoque voltou.
-- #1  registrar_devolucao(): tudo numa transação (SECURITY DEFINER). Antes o app
--     fazia 4 escritas soltas (devolução + itens + estoque + financeiro); falha
--     no meio deixava estado inconsistente (devolução órfã, estoque não retornado).
--
-- Idempotente. Seguro reaplicar.
-- ============================================================

-- #2 — coluna deposito_id passa a TEXT + FK para depositos (valores atuais são null)
alter table devolucoes alter column deposito_id type text using deposito_id::text;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'devolucoes' and constraint_name = 'devolucoes_deposito_id_fkey'
  ) then
    alter table devolucoes add constraint devolucoes_deposito_id_fkey
      foreign key (deposito_id) references depositos(id);
  end if;
end $$;

-- #1 — devolução atômica
create or replace function public.registrar_devolucao(
  p_venda_id            uuid,
  p_deposito_id         text,
  p_pessoa_id           text,
  p_pessoa_nome         text,
  p_vendedor_nome       text,
  p_motivo              text,
  p_tipo_credito        text,
  p_itens               jsonb,
  p_lancamento_pendente boolean
) returns jsonb
 language plpgsql
 security definer
as $function$
declare
  v_devolucao_id uuid := gen_random_uuid();
  v_valor_total  numeric := 0;
  v_item         jsonb;
  v_deposito     text;
  v_estoque_id   uuid;
  v_today        date := current_date;
  v_now          timestamptz := now();
begin
  -- total
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_valor_total := v_valor_total + (v_item->>'total_item')::numeric;
  end loop;

  -- depósito real de retorno; se faltar, o primeiro cadastrado
  v_deposito := p_deposito_id;
  if v_deposito is null then
    select id into v_deposito from depositos order by nome limit 1;
  end if;
  if v_deposito is null then
    raise exception 'Nenhum depósito cadastrado para retornar o estoque.';
  end if;

  -- devolução
  insert into devolucoes (id, venda_id, deposito_id, pessoa_nome, vendedor_nome, motivo, valor_total, tipo_credito, status)
  values (v_devolucao_id, p_venda_id, v_deposito, coalesce(p_pessoa_nome, 'Cliente Final'),
          p_vendedor_nome, nullif(p_motivo, ''), v_valor_total, p_tipo_credito, 'concluida');

  -- itens
  insert into itens_devolucao (devolucao_id, produto_id, nome, quantidade, preco_unitario, total_item, status_produto)
  select v_devolucao_id, item->>'produto_id', item->>'nome', (item->>'quantidade')::numeric,
         (item->>'preco_unitario')::numeric, (item->>'total_item')::numeric, coalesce(item->>'status_produto', 'ok')
  from jsonb_array_elements(p_itens) as item;

  -- retorno ao estoque (update ou insert por item)
  for v_item in select * from jsonb_array_elements(p_itens) loop
    select id into v_estoque_id from estoque
    where produto_id = (v_item->>'produto_id') and deposito_id = v_deposito
    for update;

    if found then
      update estoque set quantidade = quantidade + (v_item->>'quantidade')::numeric, updated_at = v_now
      where id = v_estoque_id;
    else
      insert into estoque (produto_id, deposito_id, quantidade)
      values (v_item->>'produto_id', v_deposito, (v_item->>'quantidade')::numeric);
    end if;
  end loop;

  -- tratamento financeiro
  if p_lancamento_pendente then
    -- devolução de fiado não pago: cancela o lançamento, não devolve dinheiro
    update lancamentos set status = 'cancelado', updated_at = v_now
    where venda_id = p_venda_id and status = 'pendente';
  elsif p_tipo_credito = 'credito_conta' then
    if p_pessoa_id is not null then
      insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id)
      values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_valor_total, 'credito', 'Devolução de compra', v_devolucao_id);
    end if;
  elsif p_tipo_credito <> 'sem_reembolso' then
    insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, updated_at)
    values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_valor_total, 'pagar', v_today, v_today, 'pago', v_today, p_tipo_credito, p_pessoa_nome, v_now);
  end if;

  return jsonb_build_object('devolucao_id', v_devolucao_id);
end;
$function$;
