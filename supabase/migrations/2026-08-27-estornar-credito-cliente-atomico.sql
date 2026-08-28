-- Estornar crédito não pode fazer dinheiro sumir. Crédito que nasceu de uma
-- DEVOLUÇÃO é dinheiro que a loja não devolveu ao cliente na hora (virou saldo).
-- Estornar esse saldo sem mais nada apagava a obrigação: o cliente ficava sem o
-- crédito E sem o dinheiro. Agora vira lançamento 'pagar' pendente no Financeiro.
-- Crédito MANUAL (sem devolucao_id) é cortesia, não tem dinheiro atrás → segue só
-- apagando, sem lançamento (decisão do dono, 27/08).
--
-- Antes era só TypeScript (2 SELECTs + 1 INSERT, sem transação) — a correção
-- passou a fazer 2 escritas acopladas (creditos_clientes + lancamentos); se a
-- segunda falhasse depois da primeira, o crédito sumia e a dívida não nascia,
-- reproduzindo o bug original de outro jeito. Virou RPC atômica.
--
-- venda_id fica de FORA do lançamento de propósito: cancelar_venda faz
-- `delete from lancamentos where venda_id = p_venda_id` — se essa dívida
-- carregasse o venda_id da venda original, cancelar aquela venda depois
-- apagaria a dívida com o cliente silenciosamente, o mesmo bug escondido de novo.
--
-- status = 'pendente' (não 'pago' como registrar_devolucao): ali o reembolso
-- sai na hora com forma escolhida na tela; aqui nada saiu ainda, é dívida em
-- aberto. Também evita que lib/saldos-contas.ts (só soma status='pago' AND
-- conta_id IS NOT NULL) ignore o valor no saldo das contas enquanto ele conta
-- como despesa quitada nos totais do Financeiro.
create or replace function public.estornar_credito_cliente(p_credito_id uuid)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_c            record;
  v_saldo        numeric;
  v_venda_numero integer;
  v_today        date := (now() at time zone 'America/Sao_Paulo')::date;
  v_lanc_id      text := null;
begin
  select id, pessoa_id, pessoa_nome, valor, tipo, devolucao_id
    into v_c from creditos_clientes where id = p_credito_id;
  if not found or v_c.tipo <> 'credito' then
    raise exception 'Movimento não é um crédito estornável.';
  end if;

  -- serializa contra um 'uso' concorrente do mesmo cliente (mesmo padrão de
  -- finalizar_venda: lock em pessoas, não na tabela de saldo agregado)
  perform 1 from pessoas where id = v_c.pessoa_id for update;

  -- saldo = créditos − usos − estornos (mesma fórmula do CreditosClient/page.tsx)
  select coalesce(sum(case when tipo in ('uso','estorno') then -valor else valor end), 0)
    into v_saldo from creditos_clientes where pessoa_id = v_c.pessoa_id;
  if v_saldo - v_c.valor < -0.01 then
    raise exception 'SALDO_INSUFICIENTE:%:%', v_saldo, v_c.valor;
  end if;

  -- índice único parcial creditos_clientes_estorno_unico barra estornar 2x
  insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, estorna_credito_id)
  values (v_c.pessoa_id, v_c.pessoa_nome, v_c.valor, 'estorno',
          'Estorno de crédito #' || p_credito_id, p_credito_id);

  if v_c.devolucao_id is not null then
    select v.numero into v_venda_numero
      from devolucoes d left join vendas v on v.id = d.venda_id
     where d.id = v_c.devolucao_id;

    v_lanc_id := gen_random_uuid()::text;
    insert into lancamentos (id, descricao, valor, tipo, categoria,
                             data_competencia, data_vencimento, status, valor_pago,
                             pessoa_nome, updated_at)
    values (v_lanc_id,
            'Estorno de crédito — devolução da venda #'
              || coalesce(v_venda_numero::text, '?') || ' — '
              || coalesce(v_c.pessoa_nome, 'Cliente'),
            v_c.valor, 'pagar', 'Estorno de crédito',
            v_today, v_today, 'pendente', 0,
            v_c.pessoa_nome, now());
  end if;

  return jsonb_build_object('lancamento_id', v_lanc_id, 'valor', v_c.valor);
end;
$function$;
