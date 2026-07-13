-- ============================================================
-- CANCELAR VENDA (feature que faltava).
--
-- O sistema tinha o status 'cancelada' na tabela vendas e até filtrava por ele,
-- mas NENHUMA action setava isso — ou seja, uma venda errada não tinha como ser
-- desfeita. O único caminho era a Devolução, que é outra coisa (devolve mercadoria
-- pro cliente, gera crédito/reembolso e deixa rastro de devolução).
--
-- Cancelar ≠ Devolver:
--   Devolução → o cliente traz a peça de volta. Vira crédito/reembolso.
--   Cancelamento → a venda não deveria ter existido (erro de digitação, teste,
--   desistência antes de entregar). Desfaz tudo e some dos totais.
--
-- O que este RPC faz, TUDO na mesma transação (falhou 1 passo, reverte tudo):
--   1. Trava a venda (FOR UPDATE) e recusa se já estiver cancelada → idempotente.
--   2. Devolve o estoque de cada item ao depósito da venda.
--   3. Devolve os IMEIs ao estoque (produto serializado volta a 'em_estoque').
--   4. Apaga os lançamentos da venda (sai do A Receber e do caixa).
--   5. Estorna o crédito de cliente usado na venda, se houve.
--   6. Marca a venda como 'cancelada'.
--
-- A venda NÃO é apagada — fica no histórico com status 'cancelada'. Os totais do
-- sistema já somam só 'concluida', então o caixa fica limpo sem perder o rastro.
-- ============================================================

create or replace function public.cancelar_venda(
  p_venda_id uuid,
  p_motivo   text default null
) returns jsonb
 language plpgsql
 security definer
as $function$
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

  -- 2. devolve o estoque dos itens
  for v_item in
    select produto_id, quantidade from itens_venda where venda_id = p_venda_id
  loop
    select id into v_est_id from estoque
    where produto_id = v_item.produto_id and deposito_id = v_deposito
    for update;

    if found then
      update estoque
        set quantidade = quantidade + v_item.quantidade, updated_at = v_now
      where id = v_est_id;
    else
      insert into estoque (produto_id, deposito_id, quantidade, updated_at)
      values (v_item.produto_id, v_deposito, v_item.quantidade, v_now);
    end if;
    v_devolvido := v_devolvido + v_item.quantidade;
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
$function$;
