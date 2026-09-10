-- Remessa de estoque entre lojas em 2 etapas (fim do "falso estoque"):
--   1) criar_remessa_estoque  -> debita a ORIGEM na hora; item fica "em trânsito".
--   2) confirmar_recebimento  -> credita o DESTINO só na confirmação da chegada física.
-- Antes, transferir_estoque debitava e creditava no mesmo instante (item "sumia"
-- da origem e já aparecia no destino antes de chegar de verdade).

create table if not exists remessas_estoque (
  id uuid primary key default gen_random_uuid(),
  origem text not null references depositos(id),
  destino text not null references depositos(id),
  status text not null default 'em_transito',  -- em_transito | recebida | cancelada
  observacao text,
  criado_por text,
  recebida_por text,
  created_at timestamptz default now(),
  recebida_em timestamptz
);

create table if not exists remessas_estoque_itens (
  id uuid primary key default gen_random_uuid(),
  remessa_id uuid not null references remessas_estoque(id) on delete cascade,
  produto_id text not null references produtos(id),
  nome text not null,
  quantidade numeric(12,3) not null,
  custo_unitario numeric(12,2) default 0,
  series jsonb default '[]'::jsonb
);

create index if not exists idx_remessas_status on remessas_estoque (status);
create index if not exists idx_remessas_itens_remessa on remessas_estoque_itens (remessa_id);

-- Cria a remessa: tira tudo da origem de uma vez (atômico — se um item falhar, nada sai).
create or replace function criar_remessa_estoque(
  p_origem text, p_destino text, p_itens jsonb, p_obs text default null, p_user text default null
) returns uuid
language plpgsql security definer
as $function$
declare
  v_remessa uuid := gen_random_uuid();
  v_item jsonb;
  v_produto_id text;
  v_qtd numeric;
  v_series jsonb;
  v_est_id uuid;
  v_disp numeric;
  v_nome text;
  v_custo numeric;
  v_nome_d text;
  v_imei jsonb;
begin
  if p_origem is null or p_destino is null then raise exception 'Selecione origem e destino'; end if;
  if p_origem = p_destino then raise exception 'Origem e destino devem ser diferentes'; end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then raise exception 'Adicione ao menos um item'; end if;

  select nome into v_nome_d from depositos where id = p_destino;
  insert into remessas_estoque (id, origem, destino, observacao, criado_por)
  values (v_remessa, p_origem, p_destino, p_obs, p_user);

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_produto_id := v_item->>'produto_id';
    v_qtd := coalesce((v_item->>'quantidade')::numeric, 0);
    v_series := coalesce(v_item->'series', '[]'::jsonb);

    -- serializado: quantidade = nº de IMEIs; cada aparelho sai da origem e vira "em trânsito"
    if jsonb_array_length(v_series) > 0 then
      v_qtd := jsonb_array_length(v_series);
      for v_imei in select * from jsonb_array_elements(v_series) loop
        update numeros_serie set status = 'em_transito', updated_at = now()
        where produto_id = v_produto_id and serie = (v_imei->>'serie')
          and deposito_id = p_origem and status = 'em_estoque';
        if not found then raise exception 'IMEI % não está em estoque na origem', v_imei->>'serie'; end if;
      end loop;
    end if;

    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida'; end if;

    select nome, preco_custo into v_nome, v_custo from produtos where id = v_produto_id;

    select id, quantidade into v_est_id, v_disp from estoque
      where produto_id = v_produto_id and deposito_id = p_origem for update;
    if not found or v_disp < v_qtd then
      raise exception 'Estoque insuficiente na origem para % (disponível: %)', coalesce(v_nome, v_produto_id), coalesce(v_disp, 0);
    end if;
    update estoque set quantidade = v_disp - v_qtd, updated_at = now() where id = v_est_id;

    insert into remessas_estoque_itens (remessa_id, produto_id, nome, quantidade, custo_unitario, series)
    values (v_remessa, v_produto_id, coalesce(v_nome, v_produto_id), v_qtd, coalesce(v_custo, 0), v_series);

    insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
    values (v_produto_id, p_origem, 'saida', round(v_qtd)::int, round(v_disp)::int, round(v_disp - v_qtd)::int,
            'Remessa p/ ' || coalesce(v_nome_d, p_destino) || coalesce(' | ' || nullif(p_obs, ''), ''), p_user, now());
  end loop;

  return v_remessa;
end;
$function$;

-- Confirma a chegada física: só agora credita o destino.
create or replace function confirmar_recebimento_remessa(p_remessa_id uuid, p_user text default null)
returns jsonb
language plpgsql security definer
as $function$
declare
  v_r record;
  v_item record;
  v_antes numeric;
  v_imei jsonb;
  v_nome_o text;
begin
  select * into v_r from remessas_estoque where id = p_remessa_id for update;
  if not found then raise exception 'Remessa não encontrada'; end if;
  if v_r.status <> 'em_transito' then raise exception 'Remessa já finalizada (status: %)', v_r.status; end if;

  select nome into v_nome_o from depositos where id = v_r.origem;

  for v_item in select * from remessas_estoque_itens where remessa_id = p_remessa_id loop
    if jsonb_array_length(coalesce(v_item.series, '[]'::jsonb)) > 0 then
      for v_imei in select * from jsonb_array_elements(v_item.series) loop
        update numeros_serie set deposito_id = v_r.destino, status = 'em_estoque', updated_at = now()
        where produto_id = v_item.produto_id and serie = (v_imei->>'serie') and status = 'em_transito';
      end loop;
    end if;

    select quantidade into v_antes from estoque
      where produto_id = v_item.produto_id and deposito_id = v_r.destino for update;
    if found then
      update estoque set quantidade = v_antes + v_item.quantidade, updated_at = now()
        where produto_id = v_item.produto_id and deposito_id = v_r.destino;
    else
      v_antes := 0;
      insert into estoque (produto_id, deposito_id, quantidade) values (v_item.produto_id, v_r.destino, v_item.quantidade);
    end if;

    insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
    values (v_item.produto_id, v_r.destino, 'entrada', round(v_item.quantidade)::int, round(v_antes)::int, round(v_antes + v_item.quantidade)::int,
            'Recebimento de ' || coalesce(v_nome_o, v_r.origem) || coalesce(' | ' || nullif(v_r.observacao, ''), ''), p_user, now());
  end loop;

  update remessas_estoque set status = 'recebida', recebida_em = now(), recebida_por = p_user where id = p_remessa_id;
  return jsonb_build_object('ok', true);
end;
$function$;
