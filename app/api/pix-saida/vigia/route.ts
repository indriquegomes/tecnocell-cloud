import { NextResponse } from 'next/server'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { lerSegredo } from '@/lib/segredos'
import { hojeSP } from '@/lib/utils'
import { montarAviso, type LancamentoPixPago } from '@/lib/pix-saida-vigia'
import { ehLinhaDeDevolucao, ehSaidaPix } from '@/lib/pix-saida'

// ============================================================================
// O aviso que o robô não consegue ver sozinho: devolução em PIX paga no app que
// NUNCA chegou como print no grupo.
//
// O webhook só conhece o que alguém manda. Quem esquece de mandar o print some do
// radar — e o mês fecha com devolução em PIX sem origem do dinheiro. Este cron roda
// 1x por dia, pergunta ao contrário e fala no grupo só quando tem o que falar.
//
// Silêncio aqui é resultado bom: nada a avisar = tudo com comprovante.
// ============================================================================

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DIAS = 7
const MAX_LINHAS = 15

function sb() {
  return createServiceClient()
}

/** Chat do grupo de estornos: variável de ambiente → o que já foi salvo. */
async function chatDoGrupo(supabase: Awaited<ReturnType<typeof sb>>): Promise<string | null> {
  if (process.env.TELEGRAM_GRUPO_ESTORNOS) return process.env.TELEGRAM_GRUPO_ESTORNOS
  const { data } = await supabase.from('configuracoes').select('valor').eq('chave', 'pixsaida_chat').maybeSingle()
  const chat = (data as { valor?: { chat_id?: string } } | null)?.valor?.chat_id
  return chat ? String(chat) : null
}

export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('forbidden', { status: 401 })
  }

  const supabase = await sb()
  const hoje = hojeSP()

  // Uma vez por dia. Cron reentrega e a Vercel pode chamar duas vezes: sem esta
  // trava o grupo receberia o mesmo aviso repetido, que é o jeito mais rápido de
  // a equipe parar de ler (19/11/2026).
  const { data: marcador } = await supabase.from('configuracoes').select('valor').eq('chave', 'pixsaida_vigia').maybeSingle()
  const ultimo = (marcador as { valor?: { dia?: string } } | null)?.valor?.dia
  if (ultimo === hoje) return NextResponse.json({ ok: true, pulado: 'já avisou hoje' })

  const desde = new Date(hoje + 'T00:00:00-03:00')
  desde.setDate(desde.getDate() - DIAS)
  const desdeISO = desde.toISOString()

  // `data_pagamento` é instante de verdade nesta tabela (a baixa grava now()), mas
  // há linhas antigas gravadas como data pura. O filtro por instante no banco é só
  // para cortar volume; quem decide o dia é `diaDoCampo`, em memória.
  const linhas = await fetchAll<{
    id: string; valor: number; status: string | null; descricao: string | null
    pessoa_nome: string | null; forma_pagamento: string | null; data_pagamento: string | null
    devolucao_id: string | null
  }>((from, to) => supabase.from('lancamentos')
    .select('id, valor, status, descricao, pessoa_nome, forma_pagamento, data_pagamento, devolucao_id')
    .eq('tipo', 'pagar')
    .eq('status', 'pago')
    .gte('data_pagamento', desdeISO)
    // Filtro grosso no banco só para não varrer o mês inteiro; a régua de verdade
    // (forma e família de descrição) é aplicada em memória pelas funções do lib.
    .or('descricao.ilike.*devolu*,descricao.ilike.*estorno*,devolucao_id.not.is.null')
    .order('id')
    .range(from, to))

  // Devolução = tem devolucao_id ou descrição "Devolução — …". Forma PIX ou
  // "fora do app": nas duas o dinheiro saiu e a prova (print) tem que existir.
  const candidatas = linhas.filter((l) =>
    ehLinhaDeDevolucao({ devolucaoId: l.devolucao_id, descricao: l.descricao }) &&
    ehSaidaPix(l.forma_pagamento),
  )

  let ligados = new Set<string>()
  if (candidatas.length) {
    const { data: vinculos } = await supabase.from('pix_saidas')
      .select('lancamento_id')
      .in('lancamento_id', candidatas.map((l) => l.id))
    ligados = new Set(((vinculos ?? []) as { lancamento_id: string | null }[])
      .map((v) => v.lancamento_id).filter((x): x is string => !!x))
  }

  const paraAviso: LancamentoPixPago[] = candidatas.map((l) => ({
    id: l.id,
    valor: Number(l.valor ?? 0),
    status: l.status,
    descricao: l.descricao,
    pessoaNome: l.pessoa_nome,
    forma: l.forma_pagamento,
    diaPagamento: l.data_pagamento,
    devolucaoId: l.devolucao_id,
    temComprovante: ligados.has(l.id),
  }))

  const texto = montarAviso(paraAviso, { dias: DIAS, maximo: MAX_LINHAS })

  // Grava o marcador mesmo quando não há nada: o dia foi conferido.
  await supabase.from('configuracoes').upsert({
    chave: 'pixsaida_vigia',
    valor: { dia: hoje, avisou: !!texto, em: new Date().toISOString() },
  })

  if (!texto) return NextResponse.json({ ok: true, avisou: false, contas: 0 })

  const token = (await lerSegredo('TELEGRAM_TOKEN_PIXSAIDA', 'pixsaida_token')) ?? ''
  const chat = await chatDoGrupo(supabase)
  if (!token || !chat) {
    return NextResponse.json({ ok: false, erro: 'bot sem token ou grupo não configurado', contas: paraAviso.length }, { status: 500 })
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: texto }),
    signal: AbortSignal.timeout(12000),
  }).catch(() => null)

  return NextResponse.json({ ok: !!r?.ok, avisou: true, contas: paraAviso.length })
}
