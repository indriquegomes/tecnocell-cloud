-- cancelar_venda devolvia ao estoque a quantidade CHEIA de itens_venda, sem
-- checar se parte já tinha voltado via uma devolução parcial anterior
-- (registrar_devolucao). Cancelar uma venda que já teve devolução parcial
-- duplicava a devolução ao estoque — com produto de IMEI o aparelho físico
-- podia sumir, mas o sistema mostrar "em estoque" (2 unidades pra 1 aparelho).
--
-- Fix: subtrai o que já está registrado em itens_devolucao pra essa
-- venda+produto antes de repor. Deliberado: subtrai independente do
-- status_produto (ok/defeito/troca) — um item já marcado como devolvido com
-- defeito nunca virou estoque vendável (nem aqui, nem na devolução em si), e
-- não é papel do cancelamento reviver isso sozinho.
--
-- IMEI (numeros_serie) NÃO precisou de mudança: o update já filtra
-- "status = 'vendido'", e um IMEI já devolvido via registrar_devolucao teve
-- seu status trocado (pra em_estoque ou defeito) e venda_id zerado — o
-- filtro dessa própria query já exclui ele, sem precisar de trava nova.
CREATE OR REPLACE FUNCTION public.cancelar_venda(p_venda_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status      text;
  v_deposito    text;
  v_numero      integer;
  v_pessoa_id   text;
  v_item        record;
  v_est_id      uuid;
  v_now         timestamptz := now();
  v_devolvido   numeric := 0;
  v_imeis       int := 0;
  v_lancs       int := 0;
  v_credito     numeric := 0;
  v_ja_devolvido numeric;
  v_a_devolver   numeric;
begin
  -- 1. trava a venda
  select status, deposito_id, numero, pessoa_id
    into v_status, v_deposito, v_numero, v_pessoa_id
  from vendas where id = p_venda_id
  for update;

  if not found then
    raise exception 'Venda não encontrada';
  end if;
  if v_status = 'cancelada' then
    -- idempotente: cancelar 2x não devolve estoque em dobro
    return jsonb_build_object('ja_cancelada', true, 'venda_numero', v_numero);
  end if;

  -- 2. devolve o estoque dos itens (só a parte que ainda não voltou via devolução parcial)
  for v_item in
    select produto_id, quantidade from itens_venda where venda_id = p_venda_id
  loop
    select coalesce(sum(idv.quantidade), 0) into v_ja_devolvido
    from itens_devolucao idv
    join devolucoes d on d.id = idv.devolucao_id
    where d.venda_id = p_venda_id and idv.produto_id = v_item.produto_id;

    v_a_devolver := greatest(0, v_item.quantidade - v_ja_devolvido);
    if v_a_devolver > 0 then
      select id into v_est_id from estoque
      where produto_id = v_item.produto_id and deposito_id = v_deposito
      for update;

      if found then
        update estoque
          set quantidade = quantidade + v_a_devolver, updated_at = v_now
        where id = v_est_id;
      else
        insert into estoque (produto_id, deposito_id, quantidade, updated_at)
        values (v_item.produto_id, v_deposito, v_a_devolver, v_now);
      end if;
      v_devolvido := v_devolvido + v_a_devolver;
    end if;
  end loop;

  -- 3. IMEIs vendidos voltam pro estoque
  update numeros_serie
    set status = 'em_estoque', venda_id = null, deposito_id = v_deposito, updated_at = v_now
  where venda_id = p_venda_id::text and status = 'vendido';
  get diagnostics v_imeis = row_count;

  -- 4. lançamentos da venda saem do financeiro (A Receber / caixa)
  delete from lancamentos where venda_id = p_venda_id;
  get diagnostics v_lancs = row_count;

  -- 5. crédito de cliente usado na venda volta pro saldo dele
  select coalesce(sum(valor), 0) into v_credito
  from creditos_clientes
  where venda_id = p_venda_id::text and tipo = 'uso';

  if v_credito > 0 then
    delete from creditos_clientes
    where venda_id = p_venda_id::text and tipo = 'uso';
  end if;

  -- 6. marca como cancelada (NÃO apaga — o histórico fica)
  update vendas
    set status = 'cancelada',
        observacoes = coalesce(observacoes || ' | ', '') || 'CANCELADA' ||
                      coalesce(': ' || nullif(trim(p_motivo), ''), '')
  where id = p_venda_id;

  return jsonb_build_object(
    'venda_numero',      v_numero,
    'estoque_devolvido', v_devolvido,
    'imeis_devolvidos',  v_imeis,
    'lancamentos_removidos', v_lancs,
    'credito_estornado', v_credito
  );
end;
$function$
