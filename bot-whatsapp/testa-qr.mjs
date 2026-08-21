// bot-whatsapp/testa-qr.mjs
// Gera o QR de conexão do WhatsApp como IMAGEM PNG (bot-whatsapp/data/qr_<slug>.png),
// que dá pra abrir e escanear com o celular de forma confiável — o QR em caracteres
// de terminal quase sempre falha.
//
// Uso: node bot-whatsapp/testa-qr.mjs
// Escaneia o PNG gerado (WhatsApp → Aparelhos conectados → Conectar um aparelho).
import path from 'node:path'
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { pino } from 'pino'
import QRCode from 'qrcode'
import { RAIZ_REPO } from '../bot/lib/env.mjs'

const MODO_TESTE = process.env.BOT_WHATSAPP_TESTE === '1'
const DIR_DATA = path.join(RAIZ_REPO, 'bot-whatsapp', 'data')

const LOJA = MODO_TESTE
  ? { slug: 'teste', pastaAuth: path.join(DIR_DATA, 'auth_teste') }
  : { slug: 'petropolis', pastaAuth: path.join(DIR_DATA, 'auth_petropolis') }

console.log(`[testa-qr] gerando QR como PNG para "${LOJA.slug}"...`)
console.log('[testa-qr] escaneie o PNG com: WhatsApp → Aparelhos conectados → Conectar um aparelho')

const { state, saveCreds } = await useMultiFileAuthState(LOJA.pastaAuth)
const { version } = await fetchLatestBaileysVersion()
const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: false })
sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect, qr } = update
  if (qr) {
    const destino = path.join(DIR_DATA, `qr_${LOJA.slug}.png`)
    QRCode.toFile(destino, qr, { width: 512, margin: 2 }).then(() => {
      console.log(`[testa-qr] QR salvo em: ${destino}`)
      console.log('[testa-qr] ABRA esse arquivo de imagem e escaneie com o celular.')
    }).catch((e) => {
      console.error('[testa-qr] falha ao salvar PNG:', e?.message || e)
    })
  }
  if (connection === 'close') {
    const code = lastDisconnect?.error?.output?.statusCode
    const deslogado = code === DisconnectReason.loggedOut
    console.error(`[testa-qr] conexão caiu (${code || 'sem código'}).`, deslogado ? 'Sessão deslogada — apague a pasta de auth e gere o QR de novo.' : 'Reconectando em 25s...')
    if (!deslogado) setTimeout(() => process.exit(0), 500) // sem reconexão infinita aqui: é só pra capturar o QR
  } else if (connection === 'open') {
    console.log('[testa-qr] conectado ao WhatsApp! Pode parar este processo.')
    process.exit(0)
  }
})
