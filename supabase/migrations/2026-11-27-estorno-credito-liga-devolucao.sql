-- 27/11/2026 — a conta aberta pelo "Cancelar crédito" passa a nascer ligada.
--
-- O estorno de um crédito que veio de devolução abre uma conta a pagar ("Estorno
-- de crédito — devolução da venda #N — Cliente"). Só que o insert não gravava
-- `devolucao_id` nem `pessoa_id`: a conta saía órfã dos dois lados. Consequências
-- reais (conferidas em 27/11/2026):
--   · o conferente de estornos acusa "conta sem devolução ligada" e "lançamento
--     sem cadastro" para sempre — FG ASSISTENCIA (142 e 77) e MICHEL GARCIA (45);
--   · o robô de PIX de saída casa pelo nome do cadastro; sem `pessoa_id` ele não
--     acha a linha pela pessoa e sobra só o texto livre.
--
-- Única mudança no corpo: o insert leva `devolucao_id` (o da devolução que criou o
-- crédito) e `pessoa_id` (o do cliente). Todo o resto do corpo é idêntico ao último
-- (2026-11-25-estorno-credito-sem-conta.sql).

drop function if exists public.estornar_credito_cliente(uuid, boolean);

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
                             pessoa_nome, pessoa_id, devolucao_id, loja_id, updated_at)
    values (v_lanc_id,
            'Estorno de crédito — devolução da venda #'
              || coalesce(v_venda_numero::text, '?') || ' — '
              || coalesce(v_c.pessoa_nome, 'Cliente'),
            v_c.valor, 'pagar', 'Estorno de crédito',
            v_today, v_today, 'pendente', 0,
            v_c.pessoa_nome, v_c.pessoa_id, v_c.devolucao_id, v_c.loja_id, now());
  end if;

  return jsonb_build_object('lancamento_id', v_lanc_id, 'valor', v_c.valor);
end;
$function$;
