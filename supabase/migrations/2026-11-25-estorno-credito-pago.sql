-- 25/11/2026 — estorno de crédito nasce PAGO.
--
-- O estorno cancela o crédito do cliente e, quando o crédito veio de uma
-- devolução, abre a conta a pagar do reembolso. Essa conta nascia PENDENTE — e
-- como o pedido de estorno é atendido na hora (grupo do WhatsApp), a loja já
-- devolveu o dinheiro e o app continuava mostrando "não pago".
--
-- Muda UMA coisa no corpo: a conta nasce status 'pago', com valor_pago, data de
-- pagamento e forma 'estorno fora do app' (o dinheiro saiu por fora do caixa/
-- conta do app; a despesa fica registrada no resultado, sem conta pendente).
-- O resto é idêntico ao último corpo (2026-09-11_vales-por-loja.sql).
--
-- A trava de "crédito já reembolsado" continua na action estornarCredito
-- (app/painel/creditos/actions.ts): só chega aqui quem ainda não foi pago.

create or replace function public.estornar_credito_cliente(p_credito_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_c            record;
  v_saldo        numeric;
  v_venda_numero integer;
  v_today        date := (now() at time zone 'America/Sao_Paulo')::date;
  v_now          timestamptz := now();
  v_lanc_id      text := null;
begin
  select id, pessoa_id, pessoa_nome, valor, tipo, devolucao_id, loja_id
    into v_c from creditos_clientes where id = p_credito_id;
  if not found or v_c.tipo <> 'credito' then
    raise exception 'Movimento não é um crédito estornável.';
  end if;

  perform 1 from pessoas where id = v_c.pessoa_id for update;

  -- saldo DA MESMA LOJA do crédito (não o saldo global do cliente)
  select coalesce(sum(case when tipo in ('uso','estorno') then -valor else valor end), 0)
    into v_saldo from creditos_clientes where pessoa_id = v_c.pessoa_id and loja_id = v_c.loja_id;
  if v_saldo - v_c.valor < -0.01 then
    raise exception 'SALDO_INSUFICIENTE:%:%', v_saldo, v_c.valor;
  end if;

  insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, estorna_credito_id, loja_id)
  values (v_c.pessoa_id, v_c.pessoa_nome, v_c.valor, 'estorno',
          'Estorno de crédito #' || p_credito_id, p_credito_id, v_c.loja_id);

  if v_c.devolucao_id is not null then
    select v.numero into v_venda_numero
      from devolucoes d left join vendas v on v.id = d.venda_id
     where d.id = v_c.devolucao_id;

    v_lanc_id := gen_random_uuid()::text;
    insert into lancamentos (id, descricao, valor, tipo, categoria,
                             data_competencia, data_vencimento, status, valor_pago,
                             data_pagamento, forma_pagamento,
                             pessoa_nome, loja_id, updated_at)
    values (v_lanc_id,
            'Estorno de crédito — devolução da venda #'
              || coalesce(v_venda_numero::text, '?') || ' — '
              || coalesce(v_c.pessoa_nome, 'Cliente'),
            v_c.valor, 'pagar', 'Estorno de crédito',
            v_today, v_today, 'pago', v_c.valor,
            v_now, 'estorno fora do app',
            v_c.pessoa_nome, v_c.loja_id, v_now);
  end if;

  return jsonb_build_object('lancamento_id', v_lanc_id, 'valor', v_c.valor);
end;
$function$;
