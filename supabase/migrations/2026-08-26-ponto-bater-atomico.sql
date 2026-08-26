-- Achado em teste de corrida deliberado (25/08): iniciarPonto/pararPonto
-- (app/painel/ponto/actions.ts) fazem um SELECT (última batida de hoje) seguido
-- de um INSERT, sem nenhuma trava — o mesmo padrão já corrigido antes pra
-- código de produto e CPF/e-mail de cliente. Confirmado ao vivo: a mesma pessoa
-- logada em 2 abas/dispositivos clicando "Iniciar" quase junto grava 2 linhas
-- 'entrada' pro mesmo dia. Consequência real: um "Parar" só fecha uma das duas
-- entradas — a outra fica pra sempre como aberta, inflando o total de horas do
-- dia até alguém perceber e corrigir na mão.
--
-- Correção: um RPC atômico que trava por usuário (pg_advisory_xact_lock —
-- libera sozinho no fim da transação, sem precisar de tabela extra) e só
-- decide oe reconsulta a última batida DEPOIS de travar. Chamada dupla
-- simultânea: a segunda espera a primeira, vê o estado já atualizado, e
-- responde com o erro certo ("já está em operação") em vez de duplicar.
create or replace function public.bater_ponto(
  p_usuario_id uuid,
  p_tipo       text,
  p_loja_id    text default null
) returns jsonb
 language plpgsql
 security definer
as $function$
declare
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ultimo  text;
begin
  if p_tipo not in ('entrada', 'saida') then
    raise exception 'Tipo de batida inválido: %', p_tipo;
  end if;

  -- serializa batidas concorrentes do MESMO usuário (chave = hash do uuid).
  -- Libera sozinho ao fim da transação da chamada RPC.
  perform pg_advisory_xact_lock(hashtext(p_usuario_id::text));

  select tipo into v_ultimo
  from pontos
  where usuario_id = p_usuario_id
    and criado_em >= (v_hoje::text || 'T00:00:00-03:00')::timestamptz
  order by criado_em desc
  limit 1;

  if p_tipo = 'entrada' and v_ultimo in ('entrada', 'retorno') then
    return jsonb_build_object('ok', false, 'erro', 'Você já está em operação.');
  end if;
  if p_tipo = 'saida' and coalesce(v_ultimo, '') not in ('entrada', 'retorno') then
    return jsonb_build_object('ok', false, 'erro', 'Você não está em operação.');
  end if;

  insert into pontos (usuario_id, tipo, loja_id) values (p_usuario_id, p_tipo, p_loja_id);
  return jsonb_build_object('ok', true);
end;
$function$
