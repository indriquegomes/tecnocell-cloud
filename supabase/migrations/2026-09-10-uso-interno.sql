-- Uso interno + custo no financeiro.
--   - Novo tipo de operação "uso_interno" (baixa estoque igual saída/perda).
--   - "perda" e "uso_interno" agora TAMBÉM criam um lançamento 'pagar' (despesa)
--     no financeiro, com o custo do item — pra não sobrar "furo sem resposta"
--     no fim do mês (comprou X, vendeu Y, o resto some sem explicação).
--
-- Única mudança funcional vs 2026-09-03-permite-estoque-negativo-servico.sql:
--   1) p_operacao in ('saida','perda','uso_interno')  -- + uso_interno
--   2) insert em lancamentos para perda/uso_interno
--   3) check constraint de operacao ganha 'uso_interno'

alter table movimentacoes_estoque drop constraint if exists movimentacoes_estoque_operacao_check;
alter table movimentacoes_estoque add constraint movimentacoes_estoque_operacao_check check (operacao in ('entrada', 'saida', 'ajuste', 'perda', 'uso_interno'));

create or replace function public.movimentar_estoque(p_produto_id text, p_deposito_id text, p_operacao text, p_quantidade numeric, p_series jsonb DEFAULT '[]'::jsonb, p_observacao text DEFAULT NULL::text, p_user text DEFAULT NULL::text, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_controla boolean;
  v_permite  boolean := false;
  v_ant      numeric := 0;
  v_nova     numeric;
  v_est_id   uuid;
  v_qtd      int := 0;
  v_novos    int := 0;
  v_dup      int := 0;
  v_s        jsonb;
  v_now      timestamptz := coalesce(p_created_at, now());
  v_upd      timestamptz := now();
  v_nome     text;
  v_custo    numeric := 0;
begin
  select controla_serie, nome, preco_custo into v_controla, v_nome, v_custo from produtos where id = p_produto_id;
  if v_controla is null then
    raise exception 'Produto não encontrado';
  end if;
  select permite_estoque_negativo into v_permite from produtos where id = p_produto_id;

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

  elsif p_operacao in ('saida', 'perda', 'uso_interno') then
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
      if not v_permite and v_qtd > v_ant then
        raise exception 'Estoque insuficiente para dar baixa (disponível: %, tentando tirar: %)', v_ant, v_qtd;
      end if;
    end if;
    if v_permite then
      v_nova := v_ant - v_qtd;
    else
      v_nova := greatest(0, v_ant - v_qtd);
    end if;

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

  -- Perda/Uso interno: o custo vira DESPESA no financeiro (pra não sumir sem
  -- explicação). 'saida' fica de fora de propósito (a conferência usa 'saida'
  -- pra acerto de contagem, e aí não é perda real).
  if p_operacao in ('perda', 'uso_interno') then
    insert into lancamentos (descricao, valor, tipo, status, valor_pago, categoria, data_competencia, data_vencimento, data_pagamento, created_at, updated_at)
    values (
      case when p_operacao = 'perda' then 'Perda' else 'Uso interno' end || ': ' || coalesce(v_nome, p_produto_id) || case when v_qtd > 1 then ' (x' || v_qtd || ')' else '' end,
      coalesce(v_custo, 0) * v_qtd,
      'pagar', 'pago', coalesce(v_custo, 0) * v_qtd,
      case when p_operacao = 'perda' then 'Perda' else 'Uso interno' end,
      v_now, v_now, v_now, v_now, v_now
    );
  end if;

  if p_operacao <> 'entrada' or v_qtd > 0 then
    insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
    values (p_produto_id, p_deposito_id, p_operacao, v_qtd, round(v_ant)::int, round(v_nova)::int, p_observacao, p_user, v_now);
  end if;

  return jsonb_build_object('qtd_nova', v_nova, 'novos', v_novos, 'duplicados', v_dup);
end;
$function$;
