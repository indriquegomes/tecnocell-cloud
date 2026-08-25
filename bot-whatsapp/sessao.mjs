import { createHash } from 'node:crypto'
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { pino } from 'pino'
import qrcode from 'qrcode-terminal'
import { classificaPergunta, escolheProduto } from './lib/ia.mjs'
import { buscaProdutos, buscaProdutosAmplo, buscaEstoque } from './lib/produtos.mjs'
import { montaResposta } from './lib/resposta.mjs'
import { registraTroca, jaAvisouHoje, marcaAvisoHoje } from './lib/db.mjs'
import { guardaPendente, pegaPendente, limpaPendente } from './lib/estado.mjs'
import { dorme } from '../bot/lib/util.mjs'
import { env } from '../bot/lib/env.mjs'

const logger = pino({ level: 'silent' })
const LINK_ENCOMENDAS = env('BOT_WHATSAPP_LINK_ENCOMENDAS')

// 401 loggedOut, 403 forbidden (conta banida), 440 connectionReplaced (WhatsApp
// Web aberto em outro lugar) e 500 badSession não se resolvem tentando de novo —
// martelar reconexão numa conta já banida/deslogada só piora. Só reconecta em
// código transitório (408, 428, 503, 515, sem código, erro de rede).
const CODIGOS_DESCONEXAO_DEFINITIVA = new Set([401, 403, 440, 500])

// Só conversa individual: remoteJid de grupo termina em @g.us, o de pessoa em
// @s.whatsapp.net (ou @lid em contas mais novas — ver Baileys docs). Mensagem
// própria (fromMe) nunca deve virar pergunta pro classificador.
function elegivel(msg) {
  if (msg.key.fromMe) return false
  const jid = msg.key.remoteJid || ''
  if (jid.endsWith('@g.us')) return false
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')
}

function textoDaMensagem(msg) {
  return msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || null
}

export async function iniciaSessao({ slug, depositoId, pastaAuth }) {
  const { state, saveCreds } = await useMultiFileAuthState(pastaAuth)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false })
  sock.ev.on('creds.update', () => {
    saveCreds().catch((e) => console.error(`[${slug}] falha ao salvar credenciais:`, e))
  })

  let fechando = false // guarda contra 'close' disparando 2x pro mesmo socket (erro de stream) e abrindo 2 cadeias de reconexão em paralelo -> respostas duplicadas
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      console.log(`\n[${slug}] escaneie o QR code no WhatsApp (Aparelhos conectados):\n`)
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'close') {
      if (fechando) return
      fechando = true
      sock.ev.removeAllListeners()

      const code = lastDisconnect?.error?.output?.statusCode
      const definitivo = CODIGOS_DESCONEXAO_DEFINITIVA.has(code)
      if (definitivo) {
        console.error(`[${slug}] conexão caiu (${code}). Sessão encerrada — precisa de ação humana: apague a pasta de auth e escaneie o QR de novo, ou verifique se a conta foi banida/aberta em outro lugar. Não vai reconectar sozinho.`)
      } else {
        console.error(`[${slug}] conexão caiu (${code || 'sem código'}). Reconectando em 5s...`)
        setTimeout(() => {
          iniciaSessao({ slug, depositoId, pastaAuth }).catch((e) => console.error(`[${slug}] falha ao reconectar:`, e))
        }, 5000)
      }
    } else if (connection === 'open') {
      console.log(`[${slug}] conectado ao WhatsApp.`)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (!elegivel(msg)) continue
      const texto = textoDaMensagem(msg)
      if (!texto) continue
      try {
        await processaMensagem(sock, { slug, depositoId }, msg.key.remoteJid, texto)
      } catch (e) {
        console.error(`[${slug}] falha ao processar mensagem:`, e?.message || e) // não deixa uma mensagem derrubar a sessão inteira
      }
    }
  })
}

// Tenta resolver a resposta do cliente contra a lista ambígua que o bot já
// ofereceu antes ("1", "a segunda", "o pro max"...). Número bate na hora, sem
// gastar chamada de IA; texto livre passa pela mesma escolheProduto() usada na
// busca nova. Devolve null se não conseguiu resolver — quem chama trata como
// pergunta nova (a lista pendente já foi limpa nesse caso, pra não interferir
// com o assunto novo).
async function tentaResolverPendente(loja, jid, texto) {
  const pendente = pegaPendente(loja.slug, jid)
  if (!pendente) return null

  const n = Number(texto.trim())
  if (Number.isInteger(n) && n >= 1 && n <= pendente.length) {
    limpaPendente(loja.slug, jid)
    return [pendente[n - 1]]
  }

  const { indice } = await escolheProduto(texto, pendente).catch(() => ({ indice: null }))
  if (indice) {
    limpaPendente(loja.slug, jid)
    return [pendente[indice - 1]]
  }

  limpaPendente(loja.slug, jid) // não resolveu — abandona a pendência, trata como assunto novo
  return null
}

async function processaMensagem(sock, loja, jid, texto) {
  const telefone = jid.split('@')[0]
  const telefoneTruncado = telefone.slice(-4)
  // chave do "avisou hoje" é um hash do JID inteiro, não os últimos 4 dígitos: dois
  // clientes diferentes podem ter os mesmos 4 dígitos finais, e aí o segundo nunca
  // recebia o aviso obrigatório de "assistente automático". telefoneTruncado continua
  // servindo só pra exibição/log em registraTroca (não muda o schema do banco).
  const chaveAviso = createHash('sha256').update(jid).digest('hex').slice(0, 16)

  let produtos = await tentaResolverPendente(loja, jid, texto)
  let buscaDescricao = null

  if (!produtos) {
    let classificacao
    try {
      classificacao = await classificaPergunta(texto)
    } catch (e) {
      console.error(`[${loja.slug}] [ERRO IA] falha ao classificar mensagem:`, e?.message || e)
      return // erro de IA nunca deve fazer o bot responder algo errado — só ignora
    }
    if (!classificacao.ehPerguntaProduto) return // fora do escopo: sem log, sem resposta
    buscaDescricao = classificacao.textoBusca

    let candidatos = await buscaProdutos(classificacao.textoBusca)
    // Busca estrita (AND) veio vazia: tenta de novo com rede mais larga (OR) e
    // deixa a IA decidir semanticamente — cobre "16 pro max oled" quando o
    // catálogo não tem a palavra "oled" no nome.
    let veioDaBuscaAmpla = candidatos.length === 0
    if (veioDaBuscaAmpla) candidatos = await buscaProdutosAmplo(classificacao.textoBusca)

    // Busca estrita com 1 resultado: toda palavra do cliente bateu literalmente
    // no nome do produto, dá pra confiar sem gastar chamada de IA. Busca ampla
    // com 1 resultado NÃO tem essa garantia — ela pontua por palavra solta e
    // pode "ganhar" ignorando uma palavra que não bateu em nada (cliente digitou
    // "fro g24" abreviando "frontal", nenhum produto tem "fro", ela achou 1
    // tampa só pelo "g24" e respondeu como se "fro" nem existisse). Por isso
    // busca ampla sempre passa pela checagem de tipo, mesmo com 1 resultado só.
    if (candidatos.length > 1 || (veioDaBuscaAmpla && candidatos.length === 1)) {
      const { indice, nenhumServe } = await escolheProduto(texto, candidatos).catch(() => ({ indice: null, nenhumServe: false }))
      if (indice) candidatos = [candidatos[indice - 1]]
      else if (nenhumServe) candidatos = [] // achou só por bater no modelo/marca, não na peça pedida — não é opção de verdade
      else if (candidatos.length === 1) candidatos = [] // 1 candidato ampla, IA não confirmou nem descartou — não responde sem certeza
    }

    produtos = candidatos
    if (produtos.length > 1) guardaPendente(loja.slug, jid, produtos)
  }

  const estoquePorId = new Map()
  if (produtos.length === 1) {
    estoquePorId.set(produtos[0].id, await buscaEstoque(produtos[0].id, loja.depositoId))
  }

  const comAviso = !jaAvisouHoje(loja.slug, chaveAviso)
  const resposta = montaResposta({ produtos, estoquePorId, comAviso, linkEncomendas: LINK_ENCOMENDAS })

  await dorme(2000 + Math.random() * 2000) // parece digitação humana, não resposta instantânea
  await sock.sendMessage(jid, { text: resposta })
  if (comAviso) marcaAvisoHoje(loja.slug, chaveAviso)

  registraTroca({
    loja: loja.slug,
    telefoneTruncado,
    pergunta: texto,
    produtoBuscado: buscaDescricao ?? produtos[0]?.nome ?? null,
    resultado: produtos.length === 1 ? 'respondido' : 'pediu_esclarecimento',
    resposta,
  })
}

