-- PONTO — um caminho só para bater.
--
-- Existiam dois caminhos com regras diferentes:
--   1. Painel (widget "Iniciar/Parar", app/painel/ponto/actions.ts) chamava este
--      RPC: tinha trava de concorrência e validação, mas só aceitava entrada e
--      saída, e a saída por ali NÃO recalculava o banco de horas do dia — o
--      atraso/hora extra do dia se perdia.
--   2. Meu Perfil (app/painel/meu-perfil/actions.ts) tinha pausa e retorno, mas
--      inseria direto na tabela `pontos`: sem validação de sequência e sem a
--      trava que este RPC foi criado para dar (25/08: duas abas clicando
--      "entrada" gravavam duas entradas, e um "Parar" fechava só uma).
--
-- Agora os dois caminhos usam este RPC, e ele aceita pausa e retorno.
--
-- Sequência válida (o "estado" é sempre a última batida do dia em São Paulo):
--   entrada  → só se está fora (nenhuma batida no dia, ou a última é 'saida')
--   pausa    → só se está em operação (última é 'entrada' ou 'retorno')
--   retorno  → só se está na pausa (última é 'pausa')
--   saida    → se está em operação OU na pausa (saiu direto do almoço é comum)
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
  v_em_operacao boolean;
begin
  if p_tipo not in ('entrada', 'pausa', 'retorno', 'saida') then
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

  v_em_operacao := coalesce(v_ultimo, '') in ('entrada', 'retorno');

  if p_tipo = 'entrada' and coalesce(v_ultimo, '') not in ('', 'saida') then
    return jsonb_build_object('ok', false, 'erro', 'Você já está em operação.');
  end if;
  if p_tipo = 'pausa' and not v_em_operacao then
    return jsonb_build_object('ok', false, 'erro', 'Você não está em operação para pausar.');
  end if;
  if p_tipo = 'retorno' and coalesce(v_ultimo, '') <> 'pausa' then
    return jsonb_build_object('ok', false, 'erro', 'Você não está na pausa.');
  end if;
  if p_tipo = 'saida' and not (v_em_operacao or coalesce(v_ultimo, '') = 'pausa') then
    return jsonb_build_object('ok', false, 'erro', 'Você não está em operação.');
  end if;

  insert into pontos (usuario_id, tipo, loja_id)
  values (p_usuario_id, p_tipo, p_loja_id);

  return jsonb_build_object('ok', true);
end;
$function$
