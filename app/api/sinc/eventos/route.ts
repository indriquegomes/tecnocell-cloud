import { createServiceClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'

// Ingestão de eventos da sincronização sombra (SIGE → TecnoCell).
//
// Recebe um evento (envelope), valida a chave de origem da loja e grava na
// fila sinc_inbox com a Porta 1 anti-duplicata (UNIQUE idempotency_key).
//
// Autenticação (decisão do dono — "cada ação tem um código"):
//   - x-sinc-loja:   qual loja está mandando
//   - authorization: Bearer <chave da loja> (código de origem)
// O ingestor faz hash da chave e compara com sinc_credencial_loja.chave_hash.
// A chave NUNCA aparece em claro no banco nem no repo.
//
// Resposta: { ok, status } onde status ∈ aceito | duplicado | invalido | erro.
//
// TODO(deferido): rate limiting por loja/IP.
// TODO(deferido): HMAC-SHA256 com pepper (ou forçar chave de 32+ bytes) —
//                 hoje SHA-256 simples é aceitável se a chave for alta entropia.
export async function POST(req: NextRequest) {
  const loja = (req.headers.get('x-sinc-loja') ?? '').trim()
  const chave = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()

  if (!loja || !chave) {
    return Response.json({ ok: false, status: 'invalido', erro: 'Faltam loja ou chave.' }, { status: 401 })
  }

  // Teto de corpo: recusa payload grande antes de parsear (DoS).
  if (Number(req.headers.get('content-length') ?? '0') > 1024 * 1024) {
    return Response.json({ ok: false, status: 'invalido', erro: 'Corpo muito grande.' }, { status: 413 })
  }

  let corpo: Record<string, unknown>
  try {
    corpo = (await req.json()) as Record<string, unknown>
  } catch {
    return Response.json({ ok: false, status: 'invalido', erro: 'Corpo não é JSON.' }, { status: 400 })
  }

  // FIX 1: corpo precisa ser objeto (null, array ou primitivo → 400).
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return Response.json({ ok: false, status: 'invalido', erro: 'Corpo deve ser um objeto JSON.' }, { status: 400 })
  }

  const idempotency_key = typeof corpo.idempotency_key === 'string' ? corpo.idempotency_key.trim() : ''
  const entidade = typeof corpo.entidade === 'string' ? corpo.entidade.trim() : ''
  const acao = typeof corpo.acao === 'string' ? corpo.acao.trim() : ''

  if (!idempotency_key || !entidade || !acao) {
    return Response.json({ ok: false, status: 'invalido', erro: 'Faltam campos obrigatórios: idempotency_key, entidade, acao.' }, { status: 400 })
  }

  // FIX 3: a idempotency_key pertence à loja autenticada (namespace por loja).
  if (!idempotency_key.startsWith(loja + ':')) {
    return Response.json({ ok: false, status: 'invalido', erro: 'idempotency_key deve começar com o id da loja.' }, { status: 400 })
  }

  // FIX 2: sequencia aceita number ou string numérica; inválida → 400 (nunca anular em silêncio).
  const seqRaw = corpo.sequencia
  let sequencia: number | null = null
  if (seqRaw !== undefined && seqRaw !== null) {
    if (typeof seqRaw === 'number' && Number.isFinite(seqRaw)) {
      sequencia = Math.trunc(seqRaw)
    } else if (typeof seqRaw === 'string' && /^\d+$/.test(seqRaw.trim())) {
      sequencia = parseInt(seqRaw.trim(), 10)
    } else {
      return Response.json({ ok: false, status: 'invalido', erro: 'sequencia inválida.' }, { status: 400 })
    }
  }

  // FIX 5: payload precisa ser objeto; ausente vira {}.
  const payloadRaw = corpo.payload
  let payload: Record<string, unknown>
  if (payloadRaw === undefined || payloadRaw === null) {
    payload = {}
  } else if (typeof payloadRaw === 'object' && !Array.isArray(payloadRaw)) {
    payload = payloadRaw as Record<string, unknown>
  } else {
    return Response.json({ ok: false, status: 'invalido', erro: 'payload deve ser um objeto.' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Confere a chave de origem da loja (código de origem).
  const chaveHash = createHash('sha256').update(chave).digest('hex')
  const { data: cred } = await supabase
    .from('sinc_credencial_loja')
    .select('expira_em, revogado_em')
    .eq('loja_id', loja)
    .eq('chave_hash', chaveHash)
    .maybeSingle()

  if (!cred) {
    return Response.json({ ok: false, status: 'invalido', erro: 'Loja ou chave inválida.' }, { status: 401 })
  }
  const agora = Date.now()
  if (cred.revogado_em || (cred.expira_em && new Date(cred.expira_em as string).getTime() < agora)) {
    return Response.json({ ok: false, status: 'invalido', erro: 'Chave revogada ou expirada.' }, { status: 401 })
  }

  // Grava na fila. UNIQUE em idempotency_key = Porta 1 anti-duplicata.
  const { data: inserido, error } = await supabase
    .from('sinc_inbox')
    .insert({
      idempotency_key,
      origem: typeof corpo.origem === 'string' ? corpo.origem : 'sige',
      loja,
      entidade,
      acao,
      sige_id: typeof corpo.sige_id === 'string' ? corpo.sige_id : null,
      sequencia,
      schema_version: typeof corpo.schema_version === 'number' ? corpo.schema_version : 1,
      payload,
    })
    .select('id')

  if (error) {
    // 23505 = violação de UNIQUE = evento já existe → duplicado.
    if (error.code === '23505') {
      return Response.json({ ok: true, status: 'duplicado' })
    }
    console.error('Erro ao inserir evento na sinc_inbox:', error)
    return Response.json({ ok: false, status: 'erro', erro: 'Erro interno.' }, { status: 500 })
  }

  return Response.json({ ok: true, status: 'aceito', id: inserido?.[0]?.id ?? null })
}
