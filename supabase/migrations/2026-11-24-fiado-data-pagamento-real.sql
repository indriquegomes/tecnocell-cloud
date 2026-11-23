-- ============================================================
-- A RECEBER: data_pagamento do fiado quitado passa a ser o INSTANTE do pagamento.
--
-- O defeito: a RPC gravava `(now() at time zone 'America/Sao_Paulo')::date` — uma DATA,
-- sem hora. Como `lancamentos.data_pagamento` é `timestamptz`, o Postgres guarda
-- meia-noite no fuso da sessão (UTC): 2026-11-23T00:00:00+00:00. Em São Paulo isso é
-- 22/11 às 21h — ou seja, qualquer tela/conferência que converta para o fuso do Brasil
-- mostra o pagamento no DIA ANTERIOR (foi assim que "apareceram" recebimentos no
-- domingo 22/11, dia em que a loja não abre: são pagamentos de segunda 23/11).
--
-- Em novembro/2026, 3.240 dos 3.998 lançamentos pagos estavam com data pura assim.
--
-- A correção é UMA linha: `now()` no lugar do `::date`. O resto do corpo é IDÊNTICO ao
-- de 2026-09-19_fiado-loja-e-recebimento-atomico.sql (conferido por diff antes de subir).
--
-- Idempotente. Seguro reaplicar.
-- ============================================================

create or replace function public.receber_fiado_reais(
  p_lancamento_id text,
  p_valor numeric,
  p_forma text,
  p_historico jsonb default '[]'::jsonb,
  p_conta_id uuid default null,
  p_loja_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric;
  v_valor_pago numeric;
  v_loja uuid;
  v_quitado boolean;
begin
  select valor, coalesce(valor_pago, 0), loja_id into v_valor, v_valor_pago, v_loja
  from lancamentos where id = p_lancamento_id and tipo = 'receber' and status = 'pendente' for update;
  if not found then raise exception 'Lançamento não encontrado ou já quitado.'; end if;
  if v_loja is not null and v_loja is distinct from p_loja_id then
    raise exception 'Dívida pertence a outra loja.';
  end if;
  if p_valor <= 0 then
    raise exception 'Valor deve ser positivo.';
  end if;
  if p_valor > round(v_valor - v_valor_pago, 2) then
    raise exception 'Valor maior que o saldo devedor.';
  end if;
  v_quitado := v_valor_pago + p_valor >= v_valor;
  update lancamentos set
    valor_pago = coalesce(valor_pago, 0) + p_valor,
    forma_pagamento = p_forma,
    conta_id = case when v_quitado then p_conta_id else conta_id end,
    status = case when v_quitado then 'pago' else status end,
    -- O INSTANTE do pagamento. Antes era `::date` (data pura) e o horário se perdia.
    data_pagamento = case when v_quitado then now() else data_pagamento end,
    historico_pagamentos = coalesce(historico_pagamentos, '[]'::jsonb) || p_historico,
    updated_at = now()
  where id = p_lancamento_id;
  return jsonb_build_object('quitado', v_quitado, 'valor_pago', v_valor_pago + p_valor);
end;
$$;

revoke all on function public.receber_fiado_reais(text, numeric, text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.receber_fiado_reais(text, numeric, text, jsonb, uuid, uuid) to service_role;
