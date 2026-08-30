-- Retirada/Entrega na venda do PDV + lista de bairros por loja.
--
-- Pedido do dono 28/08: escolher se a venda é retirada (padrão, como sempre
-- foi) ou entrega, e nesse caso escolher um bairro pré-cadastrado da loja ou
-- digitar um endereço qualquer. Aparece só no cupom por enquanto — sem tela
-- de "entregas do dia" nem cadastro de bairro na UI (se precisar adicionar
-- mais bairro depois, é um insert aqui, igual formas_pagamento).
--
-- Bairros iniciais são um chute razoável (bairros reais de Petrópolis e
-- Teresópolis) — o dono edita/adiciona via SQL quando quiser a lista certa.
create table if not exists bairros_entrega (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id),
  nome text not null,
  ativo boolean not null default true
);

alter table vendas add column if not exists tipo_entrega text default 'retirada';
alter table vendas add column if not exists endereco_entrega text;

comment on column vendas.tipo_entrega is 'retirada (padrão) ou entrega';
comment on column vendas.endereco_entrega is 'bairro escolhido ou endereço digitado, só quando tipo_entrega=entrega';

insert into bairros_entrega (loja_id, nome)
select l.id, b.nome
from lojas l
cross join (values ('Centro'), ('Itaipava'), ('Quitandinha'), ('Alto da Serra'), ('Valparaíso'), ('Cascatinha')) as b(nome)
where l.nome ilike 'Petrópolis'
on conflict do nothing;

insert into bairros_entrega (loja_id, nome)
select l.id, b.nome
from lojas l
cross join (values ('Centro'), ('Várzea'), ('Alto'), ('Soberbo'), ('Vale do Paquequer'), ('Fazenda Inglesa')) as b(nome)
where l.nome ilike 'Teresópolis'
on conflict do nothing;

-- finalizar_venda ganha os 2 parâmetros novos, só pra gravar — resto do corpo
-- idêntico à última versão (2026-08-25-vale-credito-forma-pagamento.sql),
-- conferido com diff antes de aplicar.
create or replace function public.finalizar_venda(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb DEFAULT '[]'::jsonb, p_vendedor_id uuid DEFAULT NULL::uuid, p_vendedor_nome text DEFAULT NULL::text, p_credito_valor numeric DEFAULT 0, p_tipo_entrega text DEFAULT 'retirada', p_endereco_entrega text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_subtotal           numeric := 0;
  v_total_produtos     numeric;
  v_total_taxas        numeric := 0;
  v_total              numeric;
  v_forma_pag_id       text;
  v_venda_id           uuid;
  v_venda_numero       integer;
  v_item               jsonb;
  v_pag                jsonb;
  v_estoque_id         uuid;
  v_qtd_disponivel     numeric;
  v_nova_qtd           numeric;
  v_pago_total         numeric := 0;
  v_fiado_total        numeric := 0;
  v_pessoa_nome        text;
  v_saldo_credito      numeric;
  v_today              date;
  v_now                timestamptz;
  v_estoque_atualizado jsonb := '{}'::jsonb;
  v_soma_pagamentos    numeric := 0;
begin
  v_today := (now() at time zone 'America/Sao_Paulo')::date;
  v_now   := now();

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_subtotal := v_subtotal + (v_item->>'quantidade')::numeric * (v_item->>'preco_unitario')::numeric;
  end loop;

  v_total_produtos := greatest(0, v_subtotal - p_desconto);

  for v_pag in select * from jsonb_array_elements(p_pagamentos) loop
    v_total_taxas := v_total_taxas + (v_pag->>'taxa')::numeric;
  end loop;

  v_total := v_total_produtos + v_total_taxas;

  select coalesce(sum((pag->>'valor')::numeric), 0) into v_soma_pagamentos
  from jsonb_array_elements(p_pagamentos) as pag;

  if exists (select 1 from jsonb_array_elements(p_pagamentos) as pag
             where (pag->>'valor')::numeric < 0) then
    raise exception 'Pagamento com valor negativo não é permitido';
  end if;

  if abs((v_soma_pagamentos + coalesce(p_credito_valor, 0)) - v_total_produtos) > 0.01 then
    raise exception 'Os pagamentos não fecham com a venda: pagamentos R$ % + crédito R$ % = R$ %, mas a venda é R$ %',
      round(v_soma_pagamentos, 2),
      round(coalesce(p_credito_valor, 0), 2),
      round(v_soma_pagamentos + coalesce(p_credito_valor, 0), 2),
      round(v_total_produtos, 2);
  end if;

  if jsonb_array_length(p_pagamentos) = 1 then
    v_forma_pag_id := p_pagamentos->0->>'forma_pagamento_id';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select id, quantidade into v_estoque_id, v_qtd_disponivel
    from estoque
    where deposito_id = p_deposito_id and produto_id = (v_item->>'produto_id')
    for update;

    if not found then
      raise exception 'Produto "%" não encontrado no estoque do depósito', v_item->>'nome';
    end if;
    if v_qtd_disponivel < (v_item->>'quantidade')::numeric then
      raise exception 'Estoque insuficiente para "%" (disponível: %)', v_item->>'nome', v_qtd_disponivel;
    end if;

    v_nova_qtd := v_qtd_disponivel - (v_item->>'quantidade')::numeric;
    update estoque set quantidade = v_nova_qtd, updated_at = v_now where id = v_estoque_id;
    v_estoque_atualizado := v_estoque_atualizado || jsonb_build_object(v_item->>'produto_id', v_nova_qtd);
  end loop;

  v_venda_numero := nextval('venda_numero_seq');

  insert into vendas (numero, total, desconto, forma_pagamento_id, pessoa_id, observacoes, status, deposito_id, vendedor_id, vendedor_nome, tipo_entrega, endereco_entrega)
  values (v_venda_numero, v_total, p_desconto, v_forma_pag_id, p_pessoa_id, nullif(p_observacoes, ''), 'concluida', p_deposito_id, p_vendedor_id, p_vendedor_nome, coalesce(p_tipo_entrega, 'retirada'), nullif(p_endereco_entrega, ''))
  returning id into v_venda_id;

  insert into itens_venda (venda_id, produto_id, quantidade, preco_unitario, desconto_item, total_item)
  select v_venda_id, (item->>'produto_id'), (item->>'quantidade')::numeric, (item->>'preco_unitario')::numeric,
         0, (item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  if p_credito_valor > 0 and p_pessoa_id is not null then
    perform 1 from pessoas where id = p_pessoa_id for update;
    select coalesce(sum(case when tipo in ('uso', 'estorno') then -valor else valor end), 0) into v_saldo_credito
    from creditos_clientes where pessoa_id = p_pessoa_id;
    if v_saldo_credito < p_credito_valor - 0.01 then
      raise exception 'Saldo de crédito insuficiente (disponível: %)', v_saldo_credito;
    end if;
    select nome into v_pessoa_nome from pessoas where id = p_pessoa_id;
    insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, venda_id)
    values (p_pessoa_id, v_pessoa_nome, p_credito_valor, 'uso', 'Usado na venda #' || v_venda_numero, v_venda_id::text);

    insert into pagamentos_venda (venda_id, forma_pagamento_id, valor, taxa, maquina, parcelas, status)
    values (v_venda_id, 'FP_VALE', p_credito_valor, 0, null, 1, 'vale');
  end if;

  if jsonb_array_length(coalesce(p_series, '[]'::jsonb)) > 0 then
    for v_item in select * from jsonb_array_elements(p_series) loop
      update numeros_serie
      set status = 'vendido', venda_id = v_venda_id::text, updated_at = v_now
      where produto_id = (v_item->>'produto_id')
        and serie = (v_item->>'serie')
        and deposito_id = p_deposito_id
        and status = 'em_estoque';
      if not found then
        raise exception 'IMEI % indisponível no estoque deste depósito', v_item->>'serie';
      end if;
    end loop;
  end if;

  insert into pagamentos_venda (venda_id, forma_pagamento_id, valor, taxa, maquina, parcelas, status)
  select v_venda_id, pag->>'forma_pagamento_id', (pag->>'valor')::numeric, (pag->>'taxa')::numeric,
         nullif(pag->>'maquina', ''), (pag->>'parcelas')::int, pag->>'status'
  from jsonb_array_elements(p_pagamentos) as pag;

  select
    coalesce(sum(case when pag->>'status' = 'pago' then (pag->>'valor')::numeric + (pag->>'taxa')::numeric else 0 end), 0),
    coalesce(sum(case when pag->>'status' = 'pendente' then (pag->>'valor')::numeric else 0 end), 0)
  into v_pago_total, v_fiado_total
  from jsonb_array_elements(p_pagamentos) as pag;

  if v_pago_total > 0 then
    insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, updated_at, venda_id)
    values ('Venda #' || v_venda_numero, v_pago_total, 'receber', v_today, v_today, 'pago', v_today, v_now, v_venda_id);
  end if;

  if v_fiado_total > 0 then
    if p_pessoa_id is not null then
      select nome into v_pessoa_nome from pessoas where id = p_pessoa_id;
    end if;
    insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, pessoa_nome, updated_at, venda_id)
    values ('A Receber — Fiado #' || v_venda_numero, v_fiado_total, 'receber', v_today, v_today, 'pendente', v_pessoa_nome, v_now, v_venda_id);
  end if;

  return jsonb_build_object(
    'venda_id', v_venda_id, 'venda_numero', v_venda_numero,
    'total', v_total, 'estoque_atualizado', v_estoque_atualizado
  );
end;
$function$;

-- CREATE OR REPLACE com 2 parâmetros novos cria uma assinatura SEPARADA (10 args)
-- em vez de substituir — mesma armadilha de sempre neste projeto. Dropa a antiga
-- explicitamente pra não sobrar uma versão velha chamável por engano.
drop function if exists public.finalizar_venda(jsonb, jsonb, text, numeric, text, text, jsonb, uuid, text, numeric);
