-- Pedido do usuário testando o F9 (Crediário): o vale-crédito já existia como
-- forma de pagamento numa venda NOVA, mas não dava pra usar o mesmo saldo pra
-- abater um fiado já em aberto. RPC nova pra debitar o saldo do cliente com a
-- mesma trava/lock que já existe em finalizar_venda pro uso de crédito numa
-- venda (só que este caso não passa pelo RPC de venda nenhuma).
--
-- Já aplicada e testada ao vivo pelo fluxo real do PDV (F9 → botão de
-- recebimento → Vale Crédito): saldo insuficiente bloqueado corretamente,
-- uso dentro do saldo debitou certo, e não criou nada em movimentos_caixa
-- (vale-crédito não é dinheiro físico entrando na gaveta).
create or replace function public.usar_credito_cliente(
  p_pessoa_id  text,
  p_valor      numeric,
  p_descricao  text
) returns void
 language plpgsql
 security definer
as $function$
declare
  v_saldo numeric;
  v_nome  text;
begin
  if p_valor <= 0 then
    raise exception 'Valor inválido.';
  end if;

  perform 1 from pessoas where id = p_pessoa_id for update;

  select coalesce(sum(case when tipo in ('uso', 'estorno') then -valor else valor end), 0)
  into v_saldo
  from creditos_clientes where pessoa_id = p_pessoa_id;

  if v_saldo < p_valor - 0.01 then
    raise exception 'Saldo de crédito insuficiente (disponível: %)', v_saldo;
  end if;

  select nome into v_nome from pessoas where id = p_pessoa_id;

  insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao)
  values (p_pessoa_id, coalesce(v_nome, 'Cliente'), p_valor, 'uso', p_descricao);
end;
$function$
