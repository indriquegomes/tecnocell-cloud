-- ============================================================
-- Entre Depósitos — transferência de estoque entre lojas (atômica).
--
-- transferir_estoque: debita a origem, credita o destino e, para produtos
-- serializados, move os IMEIs (numeros_serie.deposito_id origem→destino).
-- Loga saída na origem + entrada no destino no livro-razão (movimentacoes_estoque).
-- Tudo numa transação: falha em qualquer passo reverte o conjunto (nada de
-- sumir estoque da origem sem entrar no destino).
--
-- Idempotente (create or replace). Seguro reaplicar.
-- ============================================================

create or replace function public.transferir_estoque(
  p_produto_id text, p_origem text, p_destino text,
  p_quantidade numeric, p_series jsonb default '[]'::jsonb,
  p_obs text default null, p_user text default null
) returns jsonb
 language plpgsql
 security definer
as $function$
declare
  v_item    jsonb;
  v_qtd     numeric := p_quantidade;
  v_disp    numeric;
  v_est_id  uuid;
  v_now     timestamptz := now();
  v_nome_o  text;
  v_nome_d  text;
  v_antes_o numeric;
  v_antes_d numeric;
begin
  if p_origem is null or p_destino is null then
    raise exception 'Selecione origem e destino';
  end if;
  if p_origem = p_destino then
    raise exception 'Origem e destino devem ser diferentes';
  end if;

  -- serializado: quantidade = nº de IMEIs; move cada aparelho
  if jsonb_array_length(coalesce(p_series, '[]'::jsonb)) > 0 then
    v_qtd := jsonb_array_length(p_series);
    for v_item in select * from jsonb_array_elements(p_series) loop
      update numeros_serie set deposito_id = p_destino, updated_at = v_now
      where produto_id = p_produto_id and serie = (v_item->>'serie')
        and deposito_id = p_origem and status = 'em_estoque';
      if not found then
        raise exception 'IMEI % não está em estoque na origem', v_item->>'serie';
      end if;
    end loop;
  end if;

  if v_qtd is null or v_qtd <= 0 then
    raise exception 'Quantidade inválida';
  end if;

  -- debita origem (trava a linha)
  select id, quantidade into v_est_id, v_disp from estoque
    where produto_id = p_produto_id and deposito_id = p_origem
    for update;
  if not found or v_disp < v_qtd then
    raise exception 'Estoque insuficiente na origem (disponível: %)', coalesce(v_disp, 0);
  end if;
  v_antes_o := v_disp;
  update estoque set quantidade = v_disp - v_qtd, updated_at = v_now where id = v_est_id;

  -- credita destino (upsert)
  select quantidade into v_antes_d from estoque
    where produto_id = p_produto_id and deposito_id = p_destino
    for update;
  if found then
    update estoque set quantidade = v_antes_d + v_qtd, updated_at = v_now
      where produto_id = p_produto_id and deposito_id = p_destino;
  else
    v_antes_d := 0;
    insert into estoque (produto_id, deposito_id, quantidade) values (p_produto_id, p_destino, v_qtd);
  end if;

  select nome into v_nome_o from depositos where id = p_origem;
  select nome into v_nome_d from depositos where id = p_destino;

  -- livro-razão: saída na origem + entrada no destino
  insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
  values (p_produto_id, p_origem, 'saida', round(v_qtd)::int, round(v_antes_o)::int, round(v_antes_o - v_qtd)::int,
          'Transferência p/ ' || coalesce(v_nome_d, p_destino) || coalesce(' | ' || nullif(p_obs, ''), ''), p_user, v_now);
  insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
  values (p_produto_id, p_destino, 'entrada', round(v_qtd)::int, round(v_antes_d)::int, round(v_antes_d + v_qtd)::int,
          'Transferência de ' || coalesce(v_nome_o, p_origem) || coalesce(' | ' || nullif(p_obs, ''), ''), p_user, v_now);

  return jsonb_build_object('quantidade', v_qtd, 'origem', v_nome_o, 'destino', v_nome_d);
end;
$function$;
