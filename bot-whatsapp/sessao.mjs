import { createHash } from 'node:crypto'
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { pino } from 'pino'
import qrcode from 'qrcode-terminal'
import { classificaPergunta } from './lib/ia.mjs'
import { buscaProdutos, buscaEstoque } from './lib/produtos.mjs'
import { montaResposta } from './lib/resposta.mjs'
import { registraTroca, jaAvisouHoje, marcaAvisoHoje } from './lib/db.mjs'
import { dorme } from '../bot/lib/util.mjs'

const logger = pino({ level: 'silent' })

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

async function processaMensagem(sock, loja, jid, texto) {
  const telefone = jid.split('@')[0]
  const telefoneTruncado = telefone.slice(-4)
  // chave do "avisou hoje" é um hash do JID inteiro, não os últimos 4 dígitos: dois
  // clientes diferentes podem ter os mesmos 4 dígitos finais, e aí o segundo nunca
  // recebia o aviso obrigatório de "assistente automático". telefoneTruncado continua
  // servindo só pra exibição/log em registraTroca (não muda o schema do banco).
  const chaveAviso = createHash('sha256').update(jid).digest('hex').slice(0, 16)

  let classificacao
  try {
    classificacao = await classificaPergunta(texto)
  } catch (e) {
    console.error(`[${loja.slug}] [ERRO IA] falha ao classificar mensagem:`, e?.message || e)
    return // erro de IA nunca deve fazer o bot responder algo errado — só ignora
  }
  if (!classificacao.ehPerguntaProduto) return // fora do escopo: sem log, sem resposta

  const produtos = await buscaProdutos(classificacao.textoBusca)
  const estoquePorId = new Map()
  if (produtos.length === 1) {
    estoquePorId.set(produtos[0].id, await buscaEstoque(produtos[0].id, loja.depositoId))
  }

  const comAviso = !jaAvisouHoje(loja.slug, chaveAviso)
  const resposta = montaResposta({ produtos, estoquePorId, comAviso })

  await dorme(2000 + Math.random() * 2000) // parece digitação humana, não resposta instantânea
  await sock.sendMessage(jid, { text: resposta })
  if (comAviso) marcaAvisoHoje(loja.slug, chaveAviso)

  registraTroca({
    loja: loja.slug,
    telefoneTruncado,
    pergunta: texto,
    produtoBuscado: classificacao.textoBusca,
    resultado: produtos.length === 1 ? 'respondido' : 'pediu_esclarecimento',
    resposta,
  })
}

