import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ehContaPropria, type DestinoPix } from '@/lib/pix-destinos'
import { conciliarPixSaida, diaDoCampo, type LancamentoPagar } from '@/lib/pix-saida'
import { normalizarLeitura, mensagemDoPix, PROMPT_COMPROVANTE } from '@/lib/pix-saida-bot'
import { lerSegredo } from '@/lib/segredos'
import { diaSP, hojeSP } from '@/lib/utils'

// ============================================================================
// Webhook do bot NOVO — só PIX de SAÍDA (devolução/estorno pago ao cliente).
//
// Robô separado do bot de comprovantes de entrada, de propósito: token próprio
// (TELEGRAM_TOKEN_PIXSAIDA), tabela própria (`pix_saidas`) e nenhum import do
// `app/api/telegram/comprovante/route.ts`. Se este quebrar, o de entrada não
// sente — e vice-versa.
//
// Nesta etapa ele só CONFERE: lê o print, casa com o Financeiro e responde no
// grupo. Não baixa nada, não cria lançamento. É o que permite validar a leitura
// da IA antes de deixar um robô mexer em dinheiro.
// ============================================================================

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Loja = { id: string; nome: string; cnpj: string | null }

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
const GEMINI_MODELO = process.env.GEMINI_MODELO || 'gemini-3.8-flash'

// Token e segredo do webhook: variável de ambiente primeiro, tabela `segredos`
// depois (lib/segredos.ts). Assim o robô funciona sem depender de alguém cadastrar
// a variável no painel da Vercel — e trocar o token não exige deploy.
const token = async () => (await lerSegredo('TELEGRAM_TOKEN_PIXSAIDA', 'pixsaida_token')) ?? ''
const segredoWebhook = async () => (await lerSegredo('TELEGRAM_PIXSAIDA_SECRET', 'pixsaida_secret')) ?? ''

const fetchT = (url: string, opts: RequestInit = {}, ms = 15000) =>
  fetch(url, { ...opts, signal: AbortSignal.timeout(ms) })

async function tgSend(tk: string, chatId: number, text: string, replyTo?: number) {
  if (!tk) return
  await fetchT(
    `https://api.telegram.org/bot${tk}/sendMessage?chat_id=${chatId}${replyTo ? '&reply_to_message_id=' + replyTo : ''}&text=${encodeURIComponent(text)}`,
  ).catch(() => {})
}

// ---------- arquivo do Telegram ----------
type Arquivo = { formato: 'foto' | 'pdf'; fileId: string }
function arquivoDaMensagem(m: Record<string, unknown>): Arquivo | null {
  const fotos = m.photo as { file_id: string }[] | undefined
  if (fotos && fotos.length) return { formato: 'foto', fileId: fotos[fotos.length - 1].file_id }
  const doc = m.document as { file_id: string; mime_type?: string; file_name?: string } | undefined
  if (doc) {
    const ehPdf = /pdf/i.test(doc.mime_type || '') || /\.pdf$/i.test(doc.file_name || '')
    const ehImg = /^image\//i.test(doc.mime_type || '')
    if (ehPdf || ehImg) return { formato: ehPdf ? 'pdf' : 'foto', fileId: doc.file_id }
  }
  return null
}

// tipo da imagem pelos MAGIC BYTES (a extensão do Telegram mente às vezes)
function mimeBytes(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif'
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp'
  return 'image/jpeg'
}

async function baixarArquivo(tk: string, fileId: string): Promise<{ b64: string; mime: string } | null> {
  const info = await fetchT(`https://api.telegram.org/bot${tk}/getFile?file_id=${fileId}`).then((r) => r.json()).catch(() => null)
  const caminho = info?.result?.file_path as string | undefined
  if (!caminho) return null
  const r = await fetchT(`https://api.telegram.org/file/bot${tk}/${caminho}`, {}, 30000)
  if (!r.ok) return null
  const buf = Buffer.from(await r.arrayBuffer())
  const mime = /\.pdf$/i.test(caminho) ? 'application/pdf' : mimeBytes(buf)
  return { b64: buf.toString('base64'), mime }
}

async function geminiLe(b64: string, mime: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY não configurada')
  const r = await fetchT(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: PROMPT_COMPROVANTE }] }],
        generationConfig: { maxOutputTokens: 500, thinkingConfig: { thinkingLevel: 'low' } },
      }),
    },
    45000,
  )
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
  const j = await r.json()
  return ((j.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]).map((p) => p.text ?? '').join('')
}

function grupoDaMensagem(chatId: number): string | null {
  const pet = Number(process.env.TELEGRAM_GRUPO_PETROPOLIS || 0)
  const ter = Number(process.env.TELEGRAM_GRUPO_TERESOPOLIS || 0)
  if (chatId && chatId === pet) return 'petropolis'
  if (chatId && chatId === ter) return 'teresopolis'
  return null
}

/** Loja do grupo: casada pelo nome (as duas lojas do app). */
function lojaDoGrupo(lojas: Loja[], slug: string | null): Loja | null {
  if (!slug) return null
  const alvo = slug === 'petropolis' ? 'PETROPOLIS' : 'TERESOPOLIS'
  return lojas.find((l) => l.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes(alvo)) ?? null
}

export async function POST(req: Request) {
  const segredo = await segredoWebhook()
  if (segredo && req.headers.get('x-telegram-bot-api-secret-token') !== segredo) {
    return new NextResponse('forbidden', { status: 401 })
  }
  const tk = await token()
  if (!tk) return NextResponse.json({ ok: false, erro: 'token do bot não configurado' }, { status: 500 })

  const update = await req.json().catch(() => null) as Record<string, any> | null
  const msg = update?.message
  if (!msg?.chat?.id) return NextResponse.json({ ok: true, ignorado: 'sem mensagem' })

  const chatId = Number(msg.chat.id)
  const messageId = Number(msg.message_id)
  const arquivo = arquivoDaMensagem(msg)
  if (!arquivo) return NextResponse.json({ ok: true, ignorado: 'não é foto/pdf' })

  const supabase = sb()

  // Dedup do MESMO print (Telegram reentrega update quando a rota demora).
  const { data: jaTem } = await supabase.from('pix_saidas')
    .select('id, status, lancamento_id')
    .eq('telegram_chat_id', chatId).eq('telegram_message_id', messageId).maybeSingle()

  let pixSaidaId = (jaTem as { id?: string } | null)?.id ?? null
  if (!pixSaidaId) {
    const { data: novo, error } = await supabase.from('pix_saidas').insert({
      telegram_chat_id: chatId,
      telegram_message_id: messageId,
      telegram_user_id: msg.from?.id ?? null,
      telegram_user_nome: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || null,
      formato: arquivo.formato,
      arquivo_file_id: arquivo.fileId,
      status: 'recebido',
    }).select('id').maybeSingle()
    if (error) {
      // Print engolido em silêncio é pior que erro visível: sem esta mensagem a
      // pessoa acha que a devolução ficou registrada no app.
      await tgSend(tk, chatId, `⚠️ Não consegui registrar este print no app (${error.message.slice(0, 120)}). Avise o dono.`, messageId)
      return NextResponse.json({ ok: true, erro: error.message })
    }
    pixSaidaId = (novo as { id: string } | null)?.id ?? null
  }
  if (!pixSaidaId) return NextResponse.json({ ok: true, ignorado: 'sem id' })

  // Já processado? Não lê de novo (economiza token de IA).
  if ((jaTem as { status?: string } | null)?.status && (jaTem as { status?: string }).status !== 'recebido') {
    return NextResponse.json({ ok: true, ignorado: 'já processado' })
  }

  const bin = await baixarArquivo(tk, arquivo.fileId)
  if (!bin) {
    await supabase.from('pix_saidas').update({ status: 'ilegivel' }).eq('id', pixSaidaId)
    await tgSend(tk, chatId, '⚠️ Não consegui baixar o arquivo do Telegram. Mande o print de novo.', messageId)
    return NextResponse.json({ ok: true, erro: 'download' })
  }

  let leitura
  try {
    leitura = normalizarLeitura(await geminiLe(bin.b64, bin.mime))
  } catch (e) {
    // Falhou a IA: deixa 'recebido' para tentar de novo se o print for reenviado,
    // e avisa uma vez — silêncio faria a pessoa achar que a devolução foi registrada.
    await tgSend(tk, chatId, `⚠️ Não consegui ler este comprovante (${String((e as Error).message).slice(0, 80)}). Mande de novo ou avise o dono.`, messageId)
    return NextResponse.json({ ok: true, erro: 'ia' })
  }

  if (!leitura.ehComprovante) {
    await supabase.from('pix_saidas').update({ status: 'nao_comprovante', extraido_raw: leitura }).eq('id', pixSaidaId)
    return NextResponse.json({ ok: true, ignorado: 'não é comprovante' })
  }

  // ---------- quem é de casa ----------
  const [{ data: contas }, { data: lojasDb }] = await Promise.all([
    supabase.from('contas').select('chave_pix, titular').not('chave_pix', 'is', null),
    supabase.from('lojas').select('id, nome, cnpj'),
  ])
  const lojas = (lojasDb ?? []) as Loja[]
  const docsProprios = [
    ...lojas.map((l) => l.cnpj),
    ...((contas ?? []) as { chave_pix: string | null }[]).map((c) => c.chave_pix),
  ]
  const nomesProprios = [
    ...lojas.map((l) => l.nome),
    ...((contas ?? []) as { titular: string | null }[]).map((c) => c.titular),
  ]
  const contaPropria = (nome: string | null, doc: string | null): boolean => {
    const d: DestinoPix = { nome: nome ?? '', doc, comprovantes: 1, total: 0, semValor: 0 }
    return ehContaPropria(d, docsProprios, nomesProprios)
  }

  const recebedorEhNos = contaPropria(leitura.destinatario, leitura.destinatarioDoc)
  const pagadorEhNos = contaPropria(leitura.pagador, leitura.pagadorDoc)

  // PIX que ENTROU não é assunto deste bot (o bot de comprovantes cuida). Silêncio:
  // dois bots respondendo o mesmo print no mesmo grupo vira ruído.
  if (recebedorEhNos && !pagadorEhNos) {
    await supabase.from('pix_saidas').update({ status: 'entrada_ignorada', extraido_raw: leitura }).eq('id', pixSaidaId)
    return NextResponse.json({ ok: true, ignorado: 'pix de entrada' })
  }

  const pix = {
    valor: leitura.valor,
    dia: leitura.dia ?? hojeSP(),
    destinatario: leitura.destinatario,
    transacaoId: leitura.transacaoId,
  }

  // Mesmo PIX reenviado: o ID E2E é a prova de que é o mesmo dinheiro.
  if (leitura.transacaoId) {
    const { data: repetido } = await supabase.from('pix_saidas')
      .select('id').eq('transacao_id', leitura.transacaoId).eq('status', 'conciliado').neq('id', pixSaidaId).maybeSingle()
    if (repetido) {
      await supabase.from('pix_saidas').update({ status: 'duplicado', extraido_raw: leitura, valor: leitura.valor, dia: leitura.dia, transacao_id: leitura.transacaoId, pagador: leitura.pagador, destinatario: leitura.destinatario }).eq('id', pixSaidaId)
      await tgSend(tk, chatId, `ℹ️ Este PIX (ID ${leitura.transacaoId}) já foi conciliado antes. Nada feito.`, messageId)
      return NextResponse.json({ ok: true, ignorado: 'duplicado' })
    }
  }

  const loja = lojaDoGrupo(lojas, grupoDaMensagem(chatId))

  // ---------- candidatos no Financeiro ----------
  // Escopo desta etapa: devolução/estorno de cliente. PIX a fornecedor fica para
  // a próxima etapa (a nota do fornecedor tem outra régua de abatimento).
  const janela = 7
  const tol = 0.011
  const centro = diaDoCampo(pix.dia) ?? diaSP(new Date().toISOString())
  const de = new Date(centro + 'T12:00:00'); de.setDate(de.getDate() - janela)
  const ate = new Date(centro + 'T12:00:00'); ate.setDate(ate.getDate() + janela)
  const diaISO = (d: Date) => d.toISOString().slice(0, 10)

  const { data: linhas } = await supabase.from('lancamentos')
    .select('id, valor, tipo, status, descricao, pessoa_nome, data_pagamento, data_vencimento, devolucao_id, forma_pagamento, loja_id')
    .eq('tipo', 'pagar')
    .gte('valor', Number(pix.valor ?? 0) - tol)
    .lte('valor', Number(pix.valor ?? 0) + tol)
    .gte('data_vencimento', diaISO(de))
    .lte('data_vencimento', diaISO(ate))
    .limit(50)

  type LinhaDb = {
    id: string; valor: number; tipo: string | null; status: string | null
    descricao: string | null; pessoa_nome: string | null
    data_pagamento: string | null; data_vencimento: string | null
    devolucao_id: string | null; forma_pagamento: string | null; loja_id: string | null
  }
  const formaDevolucao = (f: string | null) => /pix|fora_do_app/i.test(String(f ?? ''))
  const ehDevolucao = (l: LinhaDb) => !!l.devolucao_id || /^devolu/i.test(String(l.descricao ?? ''))

  const base = ((linhas ?? []) as unknown as LinhaDb[]).filter(
    (l) => formaDevolucao(l.forma_pagamento) && ehDevolucao(l),
  )

  let conciliados: string[] = []
  if (base.length) {
    const { data: vinculos } = await supabase.from('pix_saidas')
      .select('lancamento_id').in('lancamento_id', base.map((l) => l.id))
    conciliados = ((vinculos ?? []) as { lancamento_id: string | null }[]).map((v) => v.lancamento_id!).filter(Boolean)
  }
  const candidatos: LancamentoPagar[] = base.map((l) => ({
    id: l.id,
    valor: Number(l.valor),
    tipo: l.tipo,
    status: l.status,
    descricao: l.descricao,
    pessoaNome: l.pessoa_nome,
    diaPagamento: l.data_pagamento,
    diaVencimento: l.data_vencimento,
    devolucaoId: l.devolucao_id,
    conciliado: conciliados.includes(l.id),
  }))

  const resultado = conciliarPixSaida(pix, candidatos, { janelaDias: janela, tolerancia: tol })
  const resposta = mensagemDoPix(pix, resultado)

  const status = resultado.tipo === 'baixar' ? 'casado' : resultado.tipo === 'escolher' ? 'ambiguo' : resultado.tipo === 'sem_par' ? 'sem_par' : 'ignorado'
  // A loja sai do grupo (quando o grupo é de uma loja) ou da própria devolução
  // casada — o grupo de estornos atende as duas lojas, então na maioria das vezes
  // quem sabe a loja é o lançamento.
  const lojaId = resultado.tipo === 'baixar'
    ? (base.find((l) => l.id === resultado.candidato.id)?.loja_id ?? loja?.id ?? null)
    : (loja?.id ?? null)
  await supabase.from('pix_saidas').update({
    status,
    valor: leitura.valor,
    dia: leitura.dia,
    pagador: leitura.pagador,
    pagador_doc: leitura.pagadorDoc,
    destinatario: leitura.destinatario,
    destinatario_doc: leitura.destinatarioDoc,
    transacao_id: leitura.transacaoId,
    loja_id: lojaId,
    extraido_raw: leitura,
  }).eq('id', pixSaidaId)

  await tgSend(tk, chatId, resposta, messageId)
  return NextResponse.json({ ok: true, status, tipo: resultado.tipo })
}
