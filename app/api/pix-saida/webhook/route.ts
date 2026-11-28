import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ehContaPropria, normNome, type DestinoPix } from '@/lib/pix-destinos'
import { conciliarPixSaida, diaDoCampo, ehLinhaDeDevolucao, ehSaidaPix, type LancamentoPagar, type PixSaida } from '@/lib/pix-saida'
import { clienteDoLancamento, lerCartaoDevolucao, normalizarLeituras, mensagemDoPix, PROMPT_COMPROVANTE, PROMPT_FOCO, type CartaoDevolucao } from '@/lib/pix-saida-bot'
import { baixarContaPendente } from '@/lib/baixar-conta-pendente'
import { lerSegredo } from '@/lib/segredos'
import { diaSP, formatBRL, hojeSP } from '@/lib/utils'

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

async function geminiLe(b64: string, mime: string, prompt = PROMPT_COMPROVANTE, maxTokens = 2048): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY não configurada')
  const r = await fetchT(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingLevel: 'low' } },
      }),
    },
    45000,
  )
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
  const j = await r.json()
  return ((j.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]).map((p) => p.text ?? '').join('')
}

/**
 * Lê o comprovante em DUAS passadas quando a primeira não traz valor/data.
 *
 * A primeira leitura pede tudo (inclusive o cartão de devolução) e por isso é
 * longa: com o modelo pensando antes de responder, a saída estourava o teto de
 * tokens e voltava TRUNCADA — o JSON não fechava, a leitura virava "nada lido" e
 * o print ia embora com a foto nítida (aconteceu no primeiro teste real, R$ 51,00).
 * A segunda passada é curta e resolve.
 */
async function lerComprovante(
  b64: string,
  mime: string,
): Promise<{ lidas: ReturnType<typeof normalizarLeituras>; bruto: string }> {
  const bruto = await geminiLe(b64, mime)
  const primeira = normalizarLeituras(bruto)
  const tudoCompleto = primeira.comprovantes.length > 0 && primeira.comprovantes.every((l) => l.valor && l.dia)
  if (tudoCompleto) return { lidas: primeira, bruto }

  const bruto2 = await geminiLe(b64, mime, PROMPT_FOCO, 1200)
  const segunda = normalizarLeituras(bruto2)
  // Junta por posição: uma passada pode acertar o valor e a outra a data/nome.
  // A segunda passada só lista comprovantes; se ela achar MAIS itens que a
  // primeira, os extras entram como estão (o print tem vários e a primeira
  // passada parou no primeiro).
  const comprovantes = primeira.comprovantes.map((l, i) => {
    const s = segunda.comprovantes[i]
    if (!s) return l
    return {
      ...l,
      ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null && v !== undefined)),
    } as typeof l
  })
  if (segunda.comprovantes.length > comprovantes.length) {
    comprovantes.push(...segunda.comprovantes.slice(comprovantes.length))
  }
  return {
    lidas: {
      ehComprovante: primeira.ehComprovante || segunda.ehComprovante,
      comprovantes,
      cartoes: primeira.cartoes.length ? primeira.cartoes : segunda.cartoes,
    },
    bruto: `${bruto} | FOCO: ${bruto2}`,
  }
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
 * PISTA para o caso campeão de "não achei a conta": a devolução existe, mas foi
 * lançada como `cancelamento_fiado` — e nesse tipo o app NÃO abre conta a pagar,
 * porque entende que ninguém devolveu dinheiro (só parou de cobrar). Quando o
 * dinheiro sai por PIX, a conta nunca nasce e o PIX fica sem lastro.
 *
 * Acontece quando a peça que voltou é de uma venda e a devolução foi lançada em
 * OUTRA venda do mesmo cliente (duas compras iguais no mesmo dia é o convite).
 * Devolver só a lista, com venda e nome, deixa a correção a um passo.
 */
async function pistaDeEstorno(supabase: ReturnType<typeof sb>, pix: PixSaida): Promise<string | null> {
  const centro = diaDoCampo(pix.dia) ?? diaSP(new Date().toISOString())
  const desloca = (dias: number) => {
    const d = new Date(centro + 'T12:00:00')
    d.setDate(d.getDate() + dias)
    return diaISOLocal(d)
  }
  const { data: devs } = await supabase.from('devolucoes')
    .select('id, valor_total, tipo_credito, pessoa_nome, venda_id, created_at')
    .eq('tipo_credito', 'cancelamento_fiado')
    .gte('valor_total', Number(pix.valor ?? 0) - TOLERANCIA)
    .lte('valor_total', Number(pix.valor ?? 0) + TOLERANCIA)
    .gte('created_at', desloca(-JANELA_DIAS) + 'T00:00:00')
    .order('created_at', { ascending: false })
    .limit(20)
  const lista = (devs ?? []) as { valor_total: number; pessoa_nome: string | null; venda_id: string | null; created_at: string }[]
  if (!lista.length) return null

  // Nome do PIX quase nunca é igual ao nome da devolução ("Larissa da Rocha
  // Carvalho" × "LARISSA PLAY TEC"), mas os dois dividem "LARISSA". Quem divide
  // palavra vai na frente — e só três linhas aparecem, senão vira lista de tudo
  // que custou o mesmo valor na semana.
  const tokens = new Set(
    normNome(`${pix.clienteSistema ?? ''} ${pix.destinatario ?? ''}`).split(' ').filter((t) => t.length >= 4),
  )
  const pontos = (nome: string | null) =>
    normNome(nome).split(' ').filter((t) => t.length >= 4 && tokens.has(t)).length
  const ordenada = [...lista].sort((a, b) => pontos(b.pessoa_nome) - pontos(a.pessoa_nome))
  const escolhidas = ordenada.slice(0, 3)

  // O número da venda é o que a pessoa precisa para abrir a tela certa.
  const numeros = new Map<string, string>()
  for (const d of escolhidas) {
    if (!d.venda_id || numeros.has(d.venda_id)) continue
    const { data: v } = await supabase.from('vendas').select('numero').eq('id', d.venda_id).maybeSingle()
    const numero = (v as { numero?: number } | null)?.numero
    if (numero != null) numeros.set(d.venda_id, `#${numero}`)
  }

  const linhas = escolhidas.map((d) => {
    const quando = (diaDoCampo(d.created_at) ?? '').split('-').reverse().join('/')
    return `   • ${quando} · ${d.pessoa_nome ?? 'sem nome'} · ${formatBRL(Number(d.valor_total))} · venda ${numeros.get(d.venda_id ?? '') ?? '?'}`
  })
  const resto = lista.length > escolhidas.length ? `\n   (+${lista.length - escolhidas.length} devolução(ões) desse valor na semana)` : ''
  return `💡 Achei devolução deste valor lançada como "cancelou fiado" — nesse tipo o app NÃO abre conta a pagar (entende que ninguém devolveu dinheiro):\n${linhas.join('\n')}${resto}\nSe a peça voltou e o dinheiro saiu, a devolução foi feita na venda errada ou faltou marcar o reembolso em PIX. Abra a venda certa em Devoluções e lance com reembolso "PIX da loja".`
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

  const ehDevolucao = (l: LinhaDb) => ehLinhaDeDevolucao({ devolucaoId: l.devolucao_id, descricao: l.descricao })

  // A janela é conferida em memória: `data_pagamento`/`data_vencimento` são
  // timestamptz gravados como data pura e filtrar por eles no PostgREST erra o dia.
  const base = ((linhas ?? []) as unknown as LinhaDb[]).filter(
    (l) => ehSaidaPix(l.forma_pagamento) && ehDevolucao(l),
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
): Promise<{ nome: string; cartaoId: string } | null> {
  if (!valor) return null
  const desde = new Date(Date.now() - MINUTOS_DO_CARTAO * 60000).toISOString()
  const { data } = await supabase.from('pix_saidas')
    .select('id, valor, extraido_raw')
    // O cartão pode chegar digitado ('texto') ou como imagem ('cartao').
    .in('formato', ['texto', 'cartao'])
    .eq('telegram_chat_id', chatId)
    .gte('recebido_em', desde)
    .order('recebido_em', { ascending: false })
    .limit(10)
  for (const c of (data ?? []) as { id: string; valor: number | null; extraido_raw: Record<string, unknown> | null }[]) {
    // Cartão já emprestado a outro print não serve de novo: num lote, dois PIX do
    // MESMO valor usariam o mesmo cartão e o segundo seria ligado à pessoa errada.
    if (c.extraido_raw?.cartao_usado_por) continue
    if (c.valor != null && Math.abs(Number(c.valor) - valor) <= TOLERANCIA) {
      const nome = (c.extraido_raw?.cartao as { clienteSistema?: string | null } | undefined)?.clienteSistema ?? null
      if (nome) return { nome, cartaoId: c.id }
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

  // Mesma baixa da rota do print: o cartão também pode ser o que prova a conta em
  // aberto. Só a linha 'pendente' é tocada.
  let pagou = false
  if (resultado.tipo === 'baixar' && resultado.candidato.status !== 'pago') {
    const baixa = await baixarContaPendente(supabase, resultado.candidato.id, pix.dia, nomeDoRemetente(msg))
    pagou = baixa.ok
    if (!baixa.ok && !baixa.jaEstavaPago) console.error('pix-saida (cartão): baixa recusada —', baixa.erro)
  }
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
    tk, chatId, `🧾 Cartão da devolução:\n${mensagemDoPix(pix, resultado, { pagou })}`, messageId,
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
    const texto = typeof msg.text === 'string' ? msg.text : ''
    const cartao = texto ? lerCartaoDevolucao(texto) : null
    if (!cartao) {
      // Texto que PARECE cartão e não foi entendido avisa: silêncio aqui faz a
      // pessoa achar que o nome do cliente foi registrado.
      if (/reembolso|cliente em sistema|chave pix/i.test(texto)) {
        await tgSend(tk, chatId, '🧾 Não entendi o cartão. Manda assim, um dado por linha:\nNOME DO CLIENTE EM SISTEMA: <nome>\nVALOR DO REEMBOLSO: <valor>', messageId)
      }
      return NextResponse.json({ ok: true, ignorado: 'sem foto e sem cartão' })
    }
    return await tratarCartao(tk, supabase, chatId, messageId, msg, cartao)
  }

  // Dedup do MESMO print (Telegram reentrega update quando a rota demora).
  // A coluna `ordem` existe porque uma foto pode trazer VÁRIOS comprovantes
  // empilhados: cada um vira uma linha. Sem a migration colada, cai no
  // comportamento antigo (uma linha por mensagem) e avisa no grupo.
  const temOrdem = !(await supabase.from('pix_saidas').select('ordem').limit(1)).error
  const linhaDe = async (ordem: number) => {
    let q = supabase.from('pix_saidas').select('id, status')
      .eq('telegram_chat_id', chatId).eq('telegram_message_id', messageId)
    if (temOrdem) q = q.eq('ordem', ordem)
    const { data } = await q.maybeSingle()
    return (data as { id?: string; status?: string } | null) ?? null
  }
  const jaTem = await linhaDe(1)
  // Já processado? Não lê de novo (economiza token de IA).
  // Exceção: print que NÃO casou (ou que nem foi lido) é lido de novo quando a
  // pessoa reenvia — foi justamente reenviar que descobriu-se o print com dois
  // comprovantes. Conta casada nunca é relida.
  const reprocessar = ['sem_par', 'ilegivel']
  if (jaTem?.status && jaTem.status !== 'recebido' && !reprocessar.includes(jaTem.status)) {
    return NextResponse.json({ ok: true, ignorado: 'já processado' })
  }

  const bin = await baixarArquivo(tk, arquivo.fileId)
  if (!bin) {
    await supabase.from('pix_saidas').update({ status: 'ilegivel' }).eq('id', jaTem?.id ?? '')
    await tgSend(tk, chatId, '⚠️ Não consegui baixar o arquivo do Telegram. Mande o print de novo.', messageId)
    return NextResponse.json({ ok: true, erro: 'download' })
  }

  let lidas
  let brutoIA = ''
  try {
    const lido = await lerComprovante(bin.b64, bin.mime)
    lidas = lido.lidas
    brutoIA = lido.bruto
  } catch (e) {
    // Falhou a IA: deixa 'recebido' para tentar de novo se o print for reenviado,
    // e avisa uma vez — silêncio faria a pessoa achar que a devolução foi registrada.
    await tgSend(tk, chatId, `⚠️ Não consegui ler este comprovante (${String((e as Error).message).slice(0, 80)}). Mande de novo ou avise o dono.`, messageId)
    return NextResponse.json({ ok: true, erro: 'ia' })
  }

  // ---------- imagem do CARTÃO (não é PIX) ----------
  // O cartão de devolução às vezes chega como imagem, junto dos prints. Ele diz o
  // nome do cliente NO SISTEMA — e sem isso o print, que traz o nome da conta que
  // recebeu, não casa. Antes a imagem do cartão era lida como comprovante e virava
  // um PIX inventado (valor do reembolso, data de hoje).
  let cartaoDaMensagem: CartaoDevolucao | null = null
  if (lidas.cartoes.length) {
    if (temOrdem) {
      const { data: jaCartao } = await supabase.from('pix_saidas')
        .select('id').eq('telegram_chat_id', chatId).eq('telegram_message_id', messageId)
        .eq('formato', 'cartao').maybeSingle()
      if (!jaCartao) {
        // ordem 0 = primeiro cartão da mensagem; -1, -2… os seguintes (a foto pode
        // trazer dois cartões empilhados). 1..n são os comprovantes.
        await supabase.from('pix_saidas').insert(lidas.cartoes.map((cartao, i) => ({
          telegram_chat_id: chatId,
          telegram_message_id: messageId,
          ordem: -i,
          telegram_user_id: msg.from?.id ?? null,
          telegram_user_nome: nomeDoRemetente(msg),
          formato: 'cartao',
          arquivo_file_id: arquivo.fileId,
          valor: cartao.valor,
          dia: hojeSP(),
          destinatario: cartao.nomeConta,
          status: 'recebido',
          extraido_raw: { cartao },
        })))
      }
    } else {
      // Sem a coluna `ordem`, a linha do cartão e a do print dividem a mesma
      // chave (chat, mensagem) e uma derrubaria a outra: o cartão vale só para
      // esta mensagem, em memória.
      cartaoDaMensagem = lidas.cartoes[0]
    }
  }

  const comprovantes = lidas.comprovantes
  if (!comprovantes.length) {
    const cartao = lidas.cartoes[0]
    if (cartao?.valor) {
      const { data: jaAvisou } = await supabase.from('pix_saidas')
        .select('id').eq('telegram_chat_id', chatId).eq('telegram_message_id', messageId)
        .eq('formato', 'cartao').eq('status', 'anotado').maybeSingle()
      if (!jaAvisou) {
        const outros = lidas.cartoes.length > 1 ? ` (e mais ${lidas.cartoes.length - 1} cartão(ões) nesta imagem)` : ''
        await tgSend(tk, chatId, `🧾 Cartão anotado: ${formatBRL(Number(cartao.valor))} para ${cartao.nomeConta ?? 'a conta do cliente'} (cliente no sistema: ${cartao.clienteSistema ?? 'não informado'})${outros}. Mande o print do PIX que eu caso com a conta do Financeiro.`, messageId)
        await supabase.from('pix_saidas').update({ status: 'anotado' })
          .eq('telegram_chat_id', chatId).eq('telegram_message_id', messageId).eq('formato', 'cartao')
      }
      return NextResponse.json({ ok: true, ignorado: 'cartão em imagem' })
    }
    const { data: jaTem } = await supabase.from('pix_saidas')
      .select('id').eq('telegram_chat_id', chatId).eq('telegram_message_id', messageId).limit(1).maybeSingle()
    if (jaTem) await supabase.from('pix_saidas').update({ status: 'nao_comprovante', extraido_raw: { ...lidas, bruto: brutoIA.slice(0, 600) } }).eq('id', (jaTem as { id: string }).id)
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
  const loja = lojaDoGrupo(lojas, grupoDaMensagem(chatId))

  // Quando a migration do `ordem` não está colada, só o primeiro comprovante da
  // imagem pode ser registrado — o resto apareceria como se nunca tivesse chegado.
  const fila = temOrdem ? comprovantes : comprovantes.slice(0, 1)
  let respondidos = 0

  // Um comprovante por vez: cada um é um PIX, com valor, data e conta próprios.
  for (let i = 0; i < fila.length; i++) {
    const leitura = fila[i]
    const ordem = i + 1
    const existente = ordem === 1 ? jaTem : await linhaDe(ordem)
    let pixSaidaId = existente?.id ?? null
    if (!pixSaidaId) {
      const { data: novo, error } = await supabase.from('pix_saidas').insert({
        telegram_chat_id: chatId,
        telegram_message_id: messageId,
        ...(temOrdem ? { ordem } : {}),
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
    if (!pixSaidaId) continue

    // Dia do PIX: o do comprovante. Quando a imagem está cortada e a data não
    // aparece, vale o dia do envio — sem dia não há janela, e o PIX ia para
    // "sem_par" mesmo tendo a conta certa no Financeiro.
    const diaPix = leitura.dia ?? hojeSP()

    // PIX que ENTROU não é assunto deste bot (o bot de comprovantes cuida). Silêncio:
    // dois bots respondendo o mesmo print no mesmo grupo vira ruído.
    if (contaPropria(leitura.destinatario, leitura.destinatarioDoc) && !contaPropria(leitura.pagador, leitura.pagadorDoc)) {
      await supabase.from('pix_saidas').update({ status: 'entrada_ignorada', extraido_raw: { ...leitura, bruto: brutoIA.slice(0, 600) } }).eq('id', pixSaidaId)
      continue
    }

    const pix: PixSaida = {
      valor: leitura.valor,
      dia: diaPix,
      destinatario: leitura.destinatario,
      transacaoId: leitura.transacaoId,
    }

    // Mesmo PIX reenviado: o ID E2E é a prova de que é o mesmo dinheiro.
    if (leitura.transacaoId) {
      // Qualquer linha já LIGADA com este mesmo ID de transação é repetição —
      // não importa se veio de import ("conciliado") ou deste robô ("casado").
      // Antes eu filtrava só por status='conciliado' e o robô, que grava 'casado',
      // deixava passar o mesmo print duas vezes.
      const { data: repetido } = await supabase.from('pix_saidas')
        .select('id').eq('transacao_id', leitura.transacaoId).neq('id', pixSaidaId)
        .or('status.eq.conciliado,status.eq.casado,lancamento_id.not.is.null').maybeSingle()
      if (repetido) {
        await supabase.from('pix_saidas').update({ status: 'duplicado', extraido_raw: leitura, valor: leitura.valor, dia: leitura.dia, transacao_id: leitura.transacaoId, pagador: leitura.pagador, destinatario: leitura.destinatario }).eq('id', pixSaidaId)
        await tgSend(tk, chatId, `ℹ️ Este PIX (ID ${leitura.transacaoId}) já foi conciliado antes. Nada feito.`, messageId)
        continue
      }
    }

    // O nome que casa com o Financeiro é o do CADASTRO. Se o print traz o nome da
    // conta que recebeu (parente, amigo), o cartão da devolução manda um nome melhor.
    const cartaoUsado = await clienteDoCartaoRecente(supabase, chatId, pix.valor)
    pix.clienteSistema = cartaoUsado?.nome ?? cartaoDaMensagem?.clienteSistema ?? null

    // Sem cartão, tenta o nome do recebedor registrado no cadastro do cliente
    // (pessoa_chaves_pix.favorecido). É o que o bot irmão já grava em
    // `comprovante_nome` quando o dinheiro foi para a conta de um parente: o
    // comprovante traz o nome do dono da conta, não o do cliente do Financeiro.
    if (!pix.clienteSistema && pix.destinatario) {
      const alvo = normNome(pix.destinatario)
      // ponytail: tabela pequena (dezenas de linhas) — leitura inteira e casamento
      // em memória é mais simples que montar ilike por acento. Passa de 1000 linhas,
      // troca por busca por chave/documento.
      const { data: chaves } = await supabase.from('pessoa_chaves_pix')
        .select('favorecido, pessoas ( nome )').eq('ativo', true).not('favorecido', 'is', null).limit(1000)
      const achado = (chaves ?? []).find((c) => {
        const f = normNome(c.favorecido)
        return f && (f === alvo || alvo.startsWith(f + ' ') || f.startsWith(alvo + ' '))
      })
      const nomePessoa = (achado?.pessoas as unknown as { nome: string } | null)?.nome ?? null
      if (nomePessoa) pix.clienteSistema = nomePessoa
    }

    const { resultado, base } = await candidatosDoFinanceiro(supabase, pix)

    // Conta em aberto + PIX provado = o robô dá baixa (a única escrita fora de
    // pix_saidas). Mês fechado, linha já paga ou status estranho: ele não toca e a
    // mensagem continua mandando a pessoa para a tela.
    let pagou = false
    if (resultado.tipo === 'baixar' && resultado.candidato.status !== 'pago') {
      const baixa = await baixarContaPendente(supabase, resultado.candidato.id, pix.dia, nomeDoRemetente(msg))
      pagou = baixa.ok
      if (!baixa.ok && !baixa.jaEstavaPago) console.error('pix-saida: baixa recusada —', baixa.erro)
    }
    const resposta = mensagemDoPix(pix, resultado, {
      pagou,
      pista: resultado.tipo === 'sem_par' ? await pistaDeEstorno(supabase, pix) : null,
    })

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
    const extra: Record<string, unknown> = {
      ...leitura,
      bruto: brutoIA.slice(0, 600),
      ...(candidatosParaBotao ? { candidatos: candidatosParaBotao } : {}),
      ...(leitura.dia ? {} : { dia_estimado: diaPix }),
      ...(fila.length > 1 ? { comprovante_no_print: `${ordem} de ${fila.length}` } : {}),
    }
    await supabase.from('pix_saidas').update({
      status,
      valor: leitura.valor,
      dia: diaPix,
      pagador: leitura.pagador,
      pagador_doc: leitura.pagadorDoc,
      destinatario: leitura.destinatario,
      destinatario_doc: leitura.destinatarioDoc,
      transacao_id: leitura.transacaoId,
      loja_id: lojaId,
      extraido_raw: extra,
      // Etapa 2: LIGA A PROVA. Só grava o vínculo comprovante ↔ conta; não muda
      // status, valor nem forma do lançamento — nada de dinheiro sai daqui.
      lancamento_id: resultado.tipo === 'baixar' ? resultado.candidato.id : null,
      conciliado_em: resultado.tipo === 'baixar' ? new Date().toISOString() : null,
      conciliado_por: resultado.tipo === 'baixar' ? nomeDoRemetente(msg) : null,
    }).eq('id', pixSaidaId)

    // Cartão emprestado a este print sai do páreo (senão dois PIX do mesmo valor
    // usariam o mesmo cartão).
    if (cartaoUsado) {
      const { data: doCartao } = await supabase.from('pix_saidas').select('extraido_raw').eq('id', cartaoUsado.cartaoId).maybeSingle()
      const extraCartao = ((doCartao as { extraido_raw?: Record<string, unknown> } | null)?.extraido_raw ?? {}) as Record<string, unknown>
      await supabase.from('pix_saidas').update({ extraido_raw: { ...extraCartao, cartao_usado_por: messageId } }).eq('id', cartaoUsado.cartaoId)
    }

    const cabecalho = fila.length > 1 ? `(${ordem} de ${fila.length} comprovantes neste print)\n` : ''
    await tgSend(
      tk, chatId, cabecalho + resposta, messageId,
      candidatosParaBotao ? botoesDaEscolha(resultado.tipo === 'escolher' ? resultado.candidatos : []) : undefined,
    )
    respondidos++
  }

  if (!temOrdem && comprovantes.length > 1) {
    await tgSend(tk, chatId, `⚠️ Este print tem ${comprovantes.length} comprovantes e só o primeiro pôde ser registrado: falta colar no SQL Editor a migration 2026-11-27-pix-saidas-varios-comprovantes.sql.`, messageId)
  }

  return NextResponse.json({ ok: true, comprovantes: respondidos })
}
