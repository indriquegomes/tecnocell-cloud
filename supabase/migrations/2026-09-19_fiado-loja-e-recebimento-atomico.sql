-- ============================================================================
-- Fiado com loja_id + recebimento único atômico (19/09)
--
-- Dois buracos encontrados na revisão de fim de semana:
--   1) finalizar_venda insere o fiado SEM loja_id -> o lote (receber_lancamentos_lote)
--      só barra "outra loja" quando loja_id NÃO é null; como todo fiado nasce null,
--      a trava é pulada e dá pra receber fiado da loja A contra o caixa da loja B.
--   2) o recebimento avulso (registrarPagamentoParcial/Misto) faz read-modify-write
--      de valor_pago em TypeScript (sem lock) -> duas abas recebendo o MESMO fiado
--      podem perder um update.
-- ============================================================================

-- 1) versiona lancamentos.loja_id (já existe no banco via MCP, não estava em migration)
alter table public.lancamentos add column if not exists loja_id uuid references public.lojas(id);
create index if not exists lancamentos_loja_idx on public.lancamentos (loja_id) where loja_id is not null;

-- 2) trigger: lancamento novo com venda_id herda a loja do depósito da venda.
--    Cobre o finalizar_venda (que insere o fiado sem loja_id) SEM recriar o RPC.
create or replace function public.definir_loja_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.loja_id is null and new.venda_id is not null then
    select d.loja_id into new.loja_id
    from vendas v
    join depositos d on d.id = v.deposito_id
    where v.id = new.venda_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_definir_loja_lancamento on public.lancamentos;
create trigger trg_definir_loja_lancamento
before insert or update on public.lancamentos
for each row execute function public.definir_loja_lancamento();

-- 3) backfill: fiados antigos que nasceram sem loja.
update public.lancamentos l
set loja_id = d.loja_id
from public.vendas v
join public.depositos d on d.id = v.deposito_id
where l.loja_id is null
  and l.venda_id = v.id;

-- 4) recebimento avulso ATOMICO: o TypeScript fazia read-modify-write de valor_pago
--    (duas abas recebendo o MESMO fiado perdiam um update). Agora o incremento é
--    atômico com FOR UPDATE, igual o lote. NÃO exige caixa aberto — o caixa continua
--    sendo o registrarNoCaixa leniente do TypeScript (comportamento preservado).
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
    data_pagamento = case when v_quitado then (now() at time zone 'America/Sao_Paulo')::date else data_pagamento end,
    historico_pagamentos = coalesce(historico_pagamentos, '[]'::jsonb) || p_historico,
    updated_at = now()
  where id = p_lancamento_id;
  return jsonb_build_object('quitado', v_quitado, 'valor_pago', v_valor_pago + p_valor);
end;
$$;

revoke all on function public.receber_fiado_reais(text, numeric, text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.receber_fiado_reais(text, numeric, text, jsonb, uuid, uuid) to service_role;
