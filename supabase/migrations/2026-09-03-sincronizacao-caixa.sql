-- Aplicador de CAIXA do SIGE → TecnoCell (Fase 4, sombra unilateral).
-- Recebe UMA operação de caixa por chamada e grava domínio + idempotência na
-- MESMA transação (mesmo padrão de aplicar_movimento_estoque_sige).
--
-- Decisão do conselho (Antigravity + DeepSeek + Claude + Codex):
--   • valor_fechamento = NULL quando o SIGE fecha "às cegas" (ValoresInformados
--     null = sem contagem física). O Dinheiro do SIGE vai pra reconciliação,
--     NÃO pra gaveta. Aqui o fechamento só marca status/em e nunca inventa valor.
--   • Idempotência por sige_id (ObjectId estável do SIGE): fechamento usa
--     FechamentoDeCaixa.Id, abertura/sangria/reforço usam OperacaoId (Salvar).
--     Nunca CaixaID sozinho — identifica o caixa/operador, não o turno.
--   • Gaveta = só dinheiro. Sangria/reforço gravam forma_pagamento 'Dinheiro'.
--
-- p_tipo: 'abertura' | 'fechamento' | 'sangria' | 'reforco'
-- p_sige_id: chave canônica de idempotência (ObjectId do SIGE).
-- p_caixa_sige: CaixaID do SIGE (linka abertura ↔ fechamento ↔ movimentos).

alter table caixas add column if not exists sige_caixa_id text;

create or replace function public.aplicar_caixa_sige(
  p_evento_id uuid,
  p_loja text,
  p_sequencia bigint,
  p_sige_id text,
  p_tipo text,
  p_caixa_sige text,
  p_loja_id uuid,
  p_valor numeric,
  p_motivo text,
  p_data timestamptz
) returns jsonb
language plpgsql
security definer
as $function$
declare
  v_caixa_id uuid;
  v_mov_id   uuid;
begin
  -- Idempotência: já aplicou essa operação do SIGE?
  if exists (
    select 1 from sinc_mapeamento
    where entidade = 'caixa' and sige_id = p_sige_id and loja = p_loja
  ) then
    update sinc_inbox set estado = 'aplicado', aplicado_em = now() where id = p_evento_id;
    return jsonb_build_object('duplicado', true);
  end if;

  if p_tipo = 'abertura' then
    if exists (select 1 from caixas where loja_id = p_loja_id and status = 'aberto') then
      raise exception 'caixa aberto já existe nesta loja (duplicado de abertura)';
    end if;
    insert into caixas (sige_caixa_id, status, valor_abertura, loja_id, aberto_em, obs_abertura)
    values (p_caixa_sige, 'aberto', coalesce(p_valor, 0), p_loja_id, coalesce(p_data, now()), 'SIGE')
    returning id into v_caixa_id;

  elsif p_tipo = 'fechamento' then
    select id into v_caixa_id
    from caixas
    where sige_caixa_id = p_caixa_sige and status = 'aberto'
    order by aberto_em desc
    limit 1
    for update;
    if v_caixa_id is null then
      raise exception 'caixa aberto não encontrado para fechar (ordem trocada?)';
    end if;
    update caixas
    set status = 'fechado', fechado_em = coalesce(p_data, now()), obs_fechamento = 'SIGE'
    where id = v_caixa_id;

  elsif p_tipo in ('sangria', 'reforco') then
    select id into v_caixa_id
    from caixas
    where sige_caixa_id = p_caixa_sige and status = 'aberto'
    order by aberto_em desc
    limit 1
    for update;
    if v_caixa_id is null then
      raise exception 'caixa aberto não encontrado para movimento (ordem trocada?)';
    end if;
    insert into movimentos_caixa (caixa_id, tipo, motivo, forma_pagamento, valor)
    values (
      v_caixa_id,
      case when p_tipo = 'sangria' then 'retirada' else 'reforco' end,
      nullif(p_motivo, ''),
      'Dinheiro',
      coalesce(p_valor, 0)
    )
    returning id into v_mov_id;

  else
    raise exception 'tipo de caixa desconhecido: %', p_tipo;
  end if;

  insert into sinc_mapeamento (entidade, sige_id, loja, tecno_id, ultima_sequencia, atualizado_em)
  values ('caixa', p_sige_id, p_loja, coalesce(v_caixa_id, v_mov_id)::text, coalesce(p_sequencia, 0), now());

  insert into sinc_auditoria (evento_id, entidade, sige_id, loja, acao, resultado, detalhe)
  values (p_evento_id, 'caixa', p_sige_id, p_loja, p_tipo, 'ok', coalesce(p_motivo, ''));

  update sinc_inbox set estado = 'aplicado', aplicado_em = now(), erro = null where id = p_evento_id;

  return jsonb_build_object('duplicado', false, 'caixa_id', v_caixa_id);
end;
$function$;
