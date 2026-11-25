-- 25/11/2026 — "Cancelar crédito" ganha o caso "não devo nada".
--
-- A tela de créditos tinha duas respostas: "não entreguei" (o app abre uma conta a
-- pagar pendente, porque a loja ainda deve o dinheiro) e "dinheiro/PIX" (a conta
-- nasce e é quitada, com conta/gaveta). Faltava a terceira: cancelar o crédito
-- quando NÃO há dinheiro a devolver — crédito lançado errado, cliente desistiu do
-- vale, ou o reembolso já foi pago por fora (WhatsApp). Sem ela, o crédito ficava
-- preso no saldo do cliente para sempre: a action recusa estorno quando a devolução
-- já foi reembolsada (trava de 22/11, RODRIGO PEREIRA) e não havia como limpar.
--
-- Única mudança no corpo: `p_criar_conta` (padrão true = comportamento de sempre).
-- Com false, o estorno cancela o crédito e NÃO abre conta a pagar nenhuma — nem
-- despesa no resultado. Todo o resto do corpo é idêntico ao último
-- (2026-09-11_vales-por-loja.sql).
--
-- A assinatura muda, então o create vem depois de um drop: a chamada antiga
-- (só p_credito_id) continua funcionando pelo valor padrão.

drop function if exists public.estornar_credito_cliente(uuid);

create function public.estornar_credito_cliente(p_credito_id uuid, p_criar_conta boolean default true)
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
          'Estorno de crédito #' || p_credito_id
            || case when p_criar_conta then '' else ' — sem devolução de dinheiro' end,
          p_credito_id, v_c.loja_id);

  if p_criar_conta and v_c.devolucao_id is not null then
    select v.numero into v_venda_numero
      from devolucoes d left join vendas v on v.id = d.venda_id
     where d.id = v_c.devolucao_id;

    v_lanc_id := gen_random_uuid()::text;
    insert into lancamentos (id, descricao, valor, tipo, categoria,
                             data_competencia, data_vencimento, status, valor_pago,
                             pessoa_nome, loja_id, updated_at)
    values (v_lanc_id,
            'Estorno de crédito — devolução da venda #'
              || coalesce(v_venda_numero::text, '?') || ' — '
              || coalesce(v_c.pessoa_nome, 'Cliente'),
            v_c.valor, 'pagar', 'Estorno de crédito',
            v_today, v_today, 'pendente', 0,
            v_c.pessoa_nome, v_c.loja_id, now());
  end if;

  return jsonb_build_object('lancamento_id', v_lanc_id, 'valor', v_c.valor);
end;
$function$;
