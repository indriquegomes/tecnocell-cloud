import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ehContaPropria, type DestinoPix } from '@/lib/pix-destinos'
import { conciliarPixSaida, diaDoCampo, type LancamentoPagar, type PixSaida } from '@/lib/pix-saida'
import { clienteDoLancamento, lerCartaoDevolucao, normalizarLeitura, mensagemDoPix, PROMPT_COMPROVANTE, type CartaoDevolucao } from '@/lib/pix-saida-bot'
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

async function tgSend(tk: string, chatId: number, text: string, replyTo?: number, botoes?: { text: string; callback_data: string }[][]) {
  if (!tk) return
  const corpo: Record<string, unknown> = { chat_id: chatId, text }
  if (replyTo) corpo.reply_to_message_id = replyTo
  if (botoes && botoes.length) corpo.reply_markup = { inline_keyboard: botoes }
  await fetchT(`https://api.telegram.org/bot${tk}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  }).catch(() => {})
}

async function tgEditar(tk: string, chatId: number, messageId: number, text: string) {
  if (!tk) return
  await fetchT(`https://api.telegram.org/bot${tk}/editMessageText`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  }).catch(() => {})
}

async function tgResponderClique(tk: string, id: string, texto: string) {
  if (!tk) return
  await fetchT(`https://api.telegram.org/bot${tk}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id, text: texto }),
  }).catch(() => {})
}

/** Botões do caso ambíguo: um por conta candidata + "nenhuma dessas". */
function botoesDaEscolha(candidatos: LancamentoPagar[]): { text: string; callback_data: string }[][] {
  const linhas = candidatos.slice(0, 5).map((c, i) => {
    const quem = clienteDoLancamento(c.descricao, c.pessoaNome).slice(0, 22)
    const valor = Number(c.valor ?? 0).toFixed(2).replace('.', ',')
    return [{ text: `${i + 1}. ${quem} · ${valor}`, callback_data: `e:${i}` }]
  })
  linhas.push([{ text: '❌ Nenhuma dessas', callback_data: 'n:' }])
  return linhas
}

/**
 * Clique num botão de escolha.
 *
 * A lista de candidatos vem do `extraido_raw` da MESMA linha que recebeu o print —
 * o botão carrega só o índice, então não existe caminho para um clique antigo
 * apontar para uma conta que não era da lista mostrada.
 */
async function tratarEscolha(
  tk: string,
  supabase: ReturnType<typeof sb>,
  cq: Record<string, any>,
) {
  const chatId = Number(cq.message?.chat?.id ?? 0)
  const textoBot = Number(cq.message?.message_id ?? 0)
  const idDoClique = String(cq.id ?? '')
  const quemClicou = [cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(' ') || null

  if (chatId && textoBot) await tgResponderClique(tk, idDoClique, 'processando…')

  const midDoPrint = Number(cq.message?.reply_to_message?.message_id ?? 0)
  if (!chatId || !midDoPrint) {
    if (chatId && textoBot) await tgEditar(tk, chatId, textoBot, '⚠️ Não consegui identificar o print desta escolha. Mande o print de novo.')
    return NextResponse.json({ ok: true, ignorado: 'sem print original' })
  }

  const { data: linha } = await supabase.from('pix_saidas')
    .select('id, extraido_raw, lancamento_id')
    .eq('telegram_chat_id', chatId).eq('telegram_message_id', midDoPrint).maybeSingle()
  const row = linha as { id?: string; extraido_raw?: { candidatos?: { id: string; nome: string | null; valor: number; dia: string | null }[] } } | null
  if (!row?.id) {
    await tgEditar(tk, chatId, textoBot, '⚠️ Não achei mais este print no app. Mande de novo.')
    return NextResponse.json({ ok: true, ignorado: 'print não encontrado' })
  }

  const escolha = String(cq.data ?? '')
  if (escolha.startsWith('n:')) {
    await supabase.from('pix_saidas').update({ status: 'sem_par' }).eq('id', row.id)
    await tgEditar(tk, chatId, textoBot, '❌ Marcado como "nenhuma dessas" — não liguei nada. Se o PIX saiu e não tem devolução no app, lance em Devoluções.')
    return NextResponse.json({ ok: true, status: 'sem_par' })
  }

  const indice = Number(escolha.split(':')[1] ?? -1)
  const candidato = row.extraido_raw?.candidatos?.[indice]
  if (!candidato?.id) {
    await tgEditar(tk, chatId, textoBot, '⚠️ Não achei a conta desta opção (lista mudou). Mande o print de novo.')
    return NextResponse.json({ ok: true, ignorado: 'candidato inválido' })
  }

  await supabase.from('pix_saidas').update({
    status: 'casado',
    lancamento_id: candidato.id,
    conciliado_em: new Date().toISOString(),
    conciliado_por: quemClicou,
  }).eq('id', row.id)

  await tgEditar(
    tk, chatId, textoBot,
    `✅ Ligado por ${quemClicou ?? 'alguém'} a: ${candidato.nome ?? 'conta sem nome'} · R$ ${Number(candidato.valor ?? 0).toFixed(2).replace('.', ',')}${candidato.dia ? ' · ' + candidato.dia.split('-').reverse().join('/') : ''}\nO comprovante ficou como prova desta conta.`,
  )
  return NextResponse.json({ ok: true, status: 'casado', lancamento: candidato.id })
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

const JANELA_DIAS = 7
const TOLERANCIA = 0.011
/** Quanto tempo o cartão da devolução vale como "nome do cliente" para um print. */
const MINUTOS_DO_CARTAO = 30

type LinhaDb = {
  id: string; valor: number; tipo: string | null; status: string | null
  descricao: string | null; pessoa_nome: string | null
  data_pagamento: string | null; data_vencimento: string | null
  devolucao_id: string | null; forma_pagamento: string | null; loja_id: string | null
}

/**
 * Candidatos do Financeiro para um PIX de saída.
 *
 * Escopo desta versão: devolução/estorno de cliente (PIX a fornecedor tem outra
 * régua — a nota do fornecedor). Filtro por valor e janela no BANCO (barato e
 * preciso); o casamento de nome é feito em memória por `conciliarPixSaida`.
 */
async function candidatosDoFinanceiro(supabase: ReturnType<typeof sb>, pix: PixSaida) {
  const centro = diaDoCampo(pix.dia) ?? diaSP(new Date().toISOString())
  const desloca = (dias: number) => {
    const d = new Date(centro + 'T12:00:00')
    d.setDate(d.getDate() + dias)
    return diaISOLocal(d)
  }

  const { data: linhas } = await supabase.from('lancamentos')
    .select('id, valor, tipo, status, descricao, pessoa_nome, data_pagamento, data_vencimento, devolucao_id, forma_pagamento, loja_id, created_at')
    .eq('tipo', 'pagar')
    .gte('valor', Number(pix.valor ?? 0) - TOLERANCIA)
    .lte('valor', Number(pix.valor ?? 0) + TOLERANCIA)
    .gte('created_at', desloca(-JANELA_DIAS - 400) + 'T00:00:00')
    .limit(100)

  // A forma tem DUAS grafias no banco: a chave `fora_do_app` e o rótulo que a`n  // // tela mostra (`Fora do app (WhatsApp)`). Testar só a chave perdia metade.
  const formaDevolucao = (f: string | null) => /pix|fora/i.test(String(f ?? ''))
  const ehDevolucao = (l: LinhaDb) => !!l.devolucao_id || /^(devolu|estorno)/i.test(String(l.descricao ?? ''))

  // A janela é conferida em memória: `data_pagamento`/`data_vencimento` são
  // timestamptz gravados como data pura e filtrar por eles no PostgREST erra o dia.
  const base = ((linhas ?? []) as unknown as LinhaDb[]).filter(
    (l) => formaDevolucao(l.forma_pagamento) && ehDevolucao(l),
  )

  let conciliados: string[] = []
  if (base.length) {
    // "Já tem comprovante" = já tem PROVA (linha com ID de transação do PIX). O
    // cartão da devolução NÃO conta: ele diz o nome do cliente, não prova dinheiro
    // — se contasse, o print do mesmo PIX seria recusado logo em seguida.
    const { data: vinculos } = await supabase.from('pix_saidas')
      .select('lancamento_id, transacao_id').in('lancamento_id', base.map((l) => l.id))
    conciliados = ((vinculos ?? []) as { lancamento_id: string | null; transacao_id: string | null }[])
      .filter((v) => !!v.transacao_id)
      .map((v) => v.lancamento_id!)
      .filter(Boolean)
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
    forma: l.forma_pagamento,
    conciliado: conciliados.includes(l.id),
  }))

  return {
    resultado: conciliarPixSaida(pix, candidatos, { janelaDias: JANELA_DIAS, tolerancia: TOLERANCIA }),
    base,
  }
}

/** AAAA-MM-DD sem passar por UTC (`.toISOString()` depois da 21h vira o dia seguinte). */
function diaISOLocal(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

const nomeDoRemetente = (msg: Record<string, any>) =>
  [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || null

/**
 * Nome do cliente no SISTEMA que chegou num cartão recente do mesmo grupo.
 *
 * A pessoa manda o print do PIX e, antes ou depois, o cartão da devolução. O cartão
 * é quem sabe o nome do cadastro — então um print que chega perto dele empresta
 * esse nome. Janela curta (30 min) e valor igual: cartão de outra devolução não
 * pode renomear este PIX.
 */
async function clienteDoCartaoRecente(
  supabase: ReturnType<typeof sb>,
  chatId: number,
  valor: number | null,
): Promise<string | null> {
  if (!valor) return null
  const desde = new Date(Date.now() - MINUTOS_DO_CARTAO * 60000).toISOString()
  const { data } = await supabase.from('pix_saidas')
    .select('valor, extraido_raw')
    .eq('telegram_chat_id', chatId).eq('formato', 'texto')
    .gte('recebido_em', desde)
    .order('recebido_em', { ascending: false })
    .limit(10)
  for (const c of (data ?? []) as { valor: number | null; extraido_raw: { cartao?: { clienteSistema?: string | null } } | null }[]) {
    if (c.valor != null && Math.abs(Number(c.valor) - valor) <= TOLERANCIA) {
      const nome = c.extraido_raw?.cartao?.clienteSistema ?? null
      if (nome) return nome
    }
  }
  return null
}

/**
 * Cartão da devolução: nome do cliente no sistema + valor. Sem foto de print ele
 * já basta para achar a conta no Financeiro — e é o único jeito quando o PIX foi
 * para a conta de outra pessoa.
 */
async function tratarCartao(
  tk: string,
  supabase: ReturnType<typeof sb>,
  chatId: number,
  messageId: number,
  msg: Record<string, any>,
  cartao: CartaoDevolucao,
) {
  const { data: jaExiste } = await supabase.from('pix_saidas')
    .select('id, status')
    .eq('telegram_chat_id', chatId).eq('telegram_message_id', messageId).maybeSingle()
  let id = (jaExiste as { id?: string } | null)?.id ?? null

  if (!id) {
    const { data, error } = await supabase.from('pix_saidas').insert({
      telegram_chat_id: chatId,
      telegram_message_id: messageId,
      telegram_user_id: msg.from?.id ?? null,
      telegram_user_nome: nomeDoRemetente(msg),
      formato: 'texto',
      valor: cartao.valor,
      dia: hojeSP(),
      destinatario: cartao.nomeConta,
      status: 'recebido',
      extraido_raw: { cartao },
    }).select('id').maybeSingle()
    if (error) {
      await tgSend(tk, chatId, `⚠️ Não consegui registrar este cartão no app (${error.message.slice(0, 120)}). Avise o dono.`, messageId)
      return NextResponse.json({ ok: true, erro: error.message })
    }
    id = (data as { id: string } | null)?.id ?? null
  }
  if (!id) return NextResponse.json({ ok: true, ignorado: 'sem id' })

  const pix: PixSaida = {
    valor: cartao.valor,
    dia: hojeSP(),
    destinatario: cartao.nomeConta,
    clienteSistema: cartao.clienteSistema,
  }

  if (!(Number(pix.valor) > 0) || !cartao.clienteSistema) {
    await supabase.from('pix_saidas').update({ status: 'cartao_incompleto' }).eq('id', id)
    await tgSend(tk, chatId, '🧾 Cartão recebido, mas falta o **VALOR DO REEMBOLSO** e/ou o **NOME DO CLIENTE EM SISTEMA**. Mande de novo com os dois que eu procuro a devolução.', messageId)
    return NextResponse.json({ ok: true, ignorado: 'cartão incompleto' })
  }

  const { resultado } = await candidatosDoFinanceiro(supabase, pix)
  const status = resultado.tipo === 'baixar' ? 'casado' : resultado.tipo === 'escolher' ? 'ambiguo' : 'sem_par'
  // A lista de candidatos fica gravada na linha: o botão carrega só o índice, então
  // clique não pode apontar para conta que não estava na mensagem mostrada.
  const candidatosParaBotao = resultado.tipo === 'escolher'
    ? resultado.candidatos.map((c) => ({
        id: c.id,
        nome: clienteDoLancamento(c.descricao, c.pessoaNome),
        valor: Number(c.valor ?? 0),
        dia: diaDoCampo(c.diaPagamento) ?? diaDoCampo(c.diaVencimento),
      }))
    : null

  await supabase.from('pix_saidas').update({
    status,
    valor: pix.valor,
    destinatario: cartao.nomeConta,
    extraido_raw: candidatosParaBotao ? { cartao, candidatos: candidatosParaBotao } : { cartao },
    // Cartão também liga a prova (o print do mesmo PIX liga a mesma conta depois).
    lancamento_id: resultado.tipo === 'baixar' ? resultado.candidato.id : null,
    conciliado_em: resultado.tipo === 'baixar' ? new Date().toISOString() : null,
    conciliado_por: resultado.tipo === 'baixar' ? nomeDoRemetente(msg) : null,
  }).eq('id', id)

  await tgSend(
    tk, chatId, `🧾 Cartão da devolução:\n${mensagemDoPix(pix, resultado)}`, messageId,
    candidatosParaBotao ? botoesDaEscolha(resultado.tipo === 'escolher' ? resultado.candidatos : []) : undefined,
  )
  return NextResponse.json({ ok: true, status, tipo: resultado.tipo })
}

export async function POST(req: Request) {
  const segredo = await segredoWebhook()
  if (segredo && req.headers.get('x-telegram-bot-api-secret-token') !== segredo) {
    return new NextResponse('forbidden', { status: 401 })
  }
  const tk = await token()
  if (!tk) return NextResponse.json({ ok: false, erro: 'token do bot não configurado' }, { status: 500 })

  const update = await req.json().catch(() => null) as Record<string, any> | null
  if (!update) return NextResponse.json({ ok: true, ignorado: 'corpo vazio' })

  // Clique nos botões do caso ambíguo.
  if (update.callback_query) return await tratarEscolha(tk, sb(), update.callback_query)

  const msg = update?.message
  if (!msg?.chat?.id) return NextResponse.json({ ok: true, ignorado: 'sem mensagem' })

  const chatId = Number(msg.chat.id)
  const messageId = Number(msg.message_id)
  const arquivo = arquivoDaMensagem(msg)
  const supabase = sb()

  // ---------- cartão da devolução (texto) ----------
  // O PIX vai para a conta de outra pessoa (parente, amigo) e o nome do
  // comprovante não existe no cadastro. O cartão traz o nome do SISTEMA, valor e
  // motivo — é ele que faz o casamento dar certo.
  if (!arquivo) {
    const cartao = typeof msg.text === 'string' ? lerCartaoDevolucao(msg.text) : null
    if (!cartao) return NextResponse.json({ ok: true, ignorado: 'sem foto e sem cartão' })
    return await tratarCartao(tk, supabase, chatId, messageId, msg, cartao)
  }

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
      telegram_user_nome: nomeDoRemetente(msg),
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

  const pix: PixSaida = {
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

  // O nome que casa com o Financeiro é o do CADASTRO. Se o print traz o nome da
  // conta que recebeu (parente, amigo), o cartão da devolução manda um nome melhor.
  pix.clienteSistema = await clienteDoCartaoRecente(supabase, chatId, pix.valor)

  const { resultado, base } = await candidatosDoFinanceiro(supabase, pix)
  const resposta = mensagemDoPix(pix, resultado)

  const status = resultado.tipo === 'baixar' ? 'casado' : resultado.tipo === 'escolher' ? 'ambiguo' : resultado.tipo === 'sem_par' ? 'sem_par' : 'ignorado'

  // Lista de candidatos gravada na linha para os botões do caso ambíguo: o clique
  // carrega só o índice, nunca o id de uma conta que não estava na mensagem.
  const candidatosParaBotao = resultado.tipo === 'escolher'
    ? resultado.candidatos.map((c) => ({
        id: c.id,
        nome: clienteDoLancamento(c.descricao, c.pessoaNome),
        valor: Number(c.valor ?? 0),
        dia: diaDoCampo(c.diaPagamento) ?? diaDoCampo(c.diaVencimento),
      }))
    : null
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
    extraido_raw: candidatosParaBotao ? { ...leitura, candidatos: candidatosParaBotao } : leitura,
    // Etapa 2: LIGA A PROVA. Só grava o vínculo comprovante ↔ conta; não muda
    // status, valor nem forma do lançamento — nada de dinheiro sai daqui.
    lancamento_id: resultado.tipo === 'baixar' ? resultado.candidato.id : null,
    conciliado_em: resultado.tipo === 'baixar' ? new Date().toISOString() : null,
    conciliado_por: resultado.tipo === 'baixar' ? nomeDoRemetente(msg) : null,
  }).eq('id', pixSaidaId)

  await tgSend(
    tk, chatId, resposta, messageId,
    candidatosParaBotao ? botoesDaEscolha(resultado.tipo === 'escolher' ? resultado.candidatos : []) : undefined,
  )
  return NextResponse.json({ ok: true, status, tipo: resultado.tipo })
}
