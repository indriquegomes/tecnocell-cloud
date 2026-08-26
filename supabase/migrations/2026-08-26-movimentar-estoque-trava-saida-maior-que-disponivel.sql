-- Achado testando de propósito (26/08): "Saída"/"Perda" manual de produto NÃO
-- serializado deixava passar remover mais do que existia em estoque —
-- confirmado ao vivo: saída de 2 unidades com estoque já em 0 foi aceita
-- (log ficou "qtd_anterior: 0, qtd_nova: 0", sem avisar nada). Inconsistente
-- com venda (finalizar_venda) e transferência (transferir_estoque), que já
-- recusam com "estoque insuficiente" nesse caso. Produto serializado já era
-- seguro (cada IMEI exige status 'em_estoque', senão levanta exceção).
--
-- Correção: mesma trava pro caminho não-serializado de saida/perda.
-- Já aplicada e reverificada ao vivo (3 casos: saída maior que zero disponível
-- bloqueia; entrada+saída dentro do limite funciona normal; saída maior que o
-- disponível com estoque > 0 também bloqueia).
create or replace function public.movimentar_estoque(p_produto_id text, p_deposito_id text, p_operacao text, p_quantidade numeric, p_series jsonb DEFAULT '[]'::jsonb, p_observacao text DEFAULT NULL::text, p_user text DEFAULT NULL::text, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_controla boolean;
  v_ant      numeric := 0;
  v_nova     numeric;
  v_est_id   uuid;
  v_qtd      int := 0;
  v_novos    int := 0;
  v_dup      int := 0;
  v_s        jsonb;
  v_now      timestamptz := coalesce(p_created_at, now());
  v_upd      timestamptz := now();
begin
  select controla_serie into v_controla from produtos where id = p_produto_id;
  if v_controla is null then
    raise exception 'Produto não encontrado';
  end if;

  select id, quantidade into v_est_id, v_ant from estoque
    where produto_id = p_produto_id and deposito_id = p_deposito_id
    for update;
  v_ant := coalesce(v_ant, 0);

  if p_operacao = 'entrada' then
    if v_controla then
      if jsonb_array_length(coalesce(p_series, '[]'::jsonb)) = 0 then
        raise exception 'Produto serializado: informe os IMEIs na entrada';
      end if;
      for v_s in select * from jsonb_array_elements(p_series) loop
        insert into numeros_serie (produto_id, deposito_id, serie, status)
        values (p_produto_id, p_deposito_id, v_s->>'serie', 'em_estoque')
        on conflict (produto_id, serie) do nothing;
        if found then v_novos := v_novos + 1; else v_dup := v_dup + 1; end if;
      end loop;
      v_qtd := v_novos;
    else
      v_qtd := round(p_quantidade)::int;
    end if;
    v_nova := v_ant + v_qtd;

  elsif p_operacao in ('saida', 'perda') then
    if v_controla then
      if jsonb_array_length(coalesce(p_series, '[]'::jsonb)) = 0 then
        raise exception 'Produto serializado: escolha os IMEIs para dar baixa';
      end if;
      for v_s in select * from jsonb_array_elements(p_series) loop
        update numeros_serie set status = 'defeito', updated_at = v_upd
        where produto_id = p_produto_id and serie = (v_s->>'serie')
          and deposito_id = p_deposito_id and status = 'em_estoque';
        if not found then
          raise exception 'IMEI % não está em estoque neste depósito', v_s->>'serie';
        end if;
        v_qtd := v_qtd + 1;
      end loop;
    else
      v_qtd := round(p_quantidade)::int;
      -- >>> NOVO (26/08): trava de estoque insuficiente, igual venda/transferência <<<
      if v_qtd > v_ant then
        raise exception 'Estoque insuficiente para dar baixa (disponível: %, tentando tirar: %)', v_ant, v_qtd;
      end if;
    end if;
    v_nova := greatest(0, v_ant - v_qtd);

  elsif p_operacao = 'ajuste' then
    if v_controla then
      raise exception 'Ajuste manual não é permitido para produto serializado — a contagem vem dos IMEIs';
    end if;
    v_qtd := round(p_quantidade)::int;
    v_nova := v_qtd;

  else
    raise exception 'Operação inválida: %', p_operacao;
  end if;

  if v_est_id is not null then
    update estoque set quantidade = v_nova, updated_at = v_upd where id = v_est_id;
  else
    insert into estoque (produto_id, deposito_id, quantidade, updated_at)
    values (p_produto_id, p_deposito_id, v_nova, v_upd);
  end if;

  if p_operacao <> 'entrada' or v_qtd > 0 then
    insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
    values (p_produto_id, p_deposito_id, p_operacao, v_qtd, round(v_ant)::int, round(v_nova)::int, p_observacao, p_user, v_now);
  end if;

  return jsonb_build_object('qtd_nova', v_nova, 'novos', v_novos, 'duplicados', v_dup);
end;
$function$
