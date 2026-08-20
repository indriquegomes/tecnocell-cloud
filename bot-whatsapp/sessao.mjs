import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { pino } from 'pino'
import qrcode from 'qrcode-terminal'
import { classificaPergunta } from './lib/ia.mjs'
import { buscaProdutos, buscaEstoque } from './lib/produtos.mjs'
import { montaResposta } from './lib/resposta.mjs'
import { registraTroca, jaAvisouHoje, marcaAvisoHoje } from './lib/db.mjs'
import { dorme } from '../bot/lib/util.mjs'

const logger = pino({ level: 'silent' })

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
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      console.log(`\n[${slug}] escaneie o QR code no WhatsApp (Aparelhos conectados):\n`)
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const deslogado = code === DisconnectReason.loggedOut
      console.error(`[${slug}] conexão caiu (${code || 'sem código'}).`, deslogado ? 'Sessão deslogada — apague a pasta de auth e escaneie o QR de novo.' : 'Reconectando em 5s...')
      if (!deslogado) setTimeout(() => iniciaSessao({ slug, depositoId, pastaAuth }), 5000)
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

  let classificacao
  try {
    classificacao = await classificaPergunta(texto)
  } catch (e) {
    console.error(`[${loja.slug}] falha ao classificar mensagem:`, e?.message || e)
    return // erro de IA nunca deve fazer o bot responder algo errado — só ignora
  }
  if (!classificacao.ehPerguntaProduto) return // fora do escopo: sem log, sem resposta

  const produtos = await buscaProdutos(classificacao.textoBusca)
  const estoquePorId = new Map()
  if (produtos.length === 1) {
    estoquePorId.set(produtos[0].id, await buscaEstoque(produtos[0].id, loja.depositoId))
  }

  const comAviso = !jaAvisouHoje(loja.slug, telefoneTruncado)
  const resposta = montaResposta({ produtos, estoquePorId, comAviso })

  await dorme(2000 + Math.random() * 2000) // parece digitação humana, não resposta instantânea
  await sock.sendMessage(jid, { text: resposta })
  if (comAviso) marcaAvisoHoje(loja.slug, telefoneTruncado)

  registraTroca({
    loja: loja.slug,
    telefoneTruncado,
    pergunta: texto,
    produtoBuscado: classificacao.textoBusca,
    resultado: produtos.length === 1 ? 'respondido' : 'pediu_esclarecimento',
    resposta,
  })
}
