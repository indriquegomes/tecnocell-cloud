// Bot mínimo — responde UMA coisa: como pagar por PIX.
//
// Qualquer outro assunto fica em SILÊNCIO (quem responde é a equipe, na mão).
// Leve de propósito: sem IA, sem busca de produto, sem banco local, sem log de
// conversa. O único trabalho é: mensagem individual → é pergunta de PIX? →
// manda a chave da loja. O resto é o Baileys segurando a sessão.
//
// Rodar à mão:  node bot-whatsapp/pix.mjs
// No PC da loja quem sobe é o PM2 (ecosystem.config.cjs).
// Situação:     node bot-whatsapp/status.mjs
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys'
import { pino } from 'pino'
import QRCode from 'qrcode'
import { createClient } from '@supabase/supabase-js'
import { env, RAIZ_REPO } from '../bot/lib/env.mjs'

// Loja que este processo atende (BOT_WHATSAPP_LOJA). O id é o mesmo das lojas
// do app — é ele que casa a conta bancária certa (contas.loja_id).
const LOJAS = {
  petropolis: { nome: 'Petrópolis', id: 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946' },
  teresopolis: { nome: 'Teresópolis', id: '81791d01-dc4a-485c-bbb8-f2b4cda6731c' },
}
const SLUG = (process.env.BOT_WHATSAPP_LOJA || 'petropolis').toLowerCase()
const LOJA = LOJAS[SLUG] || LOJAS.petropolis
const DIR = path.join(RAIZ_REPO, 'bot-whatsapp', 'data')
const PASTA_AUTH = path.join(DIR, `auth_${SLUG}`)
const ARQ_QR = path.join(DIR, `qr_${SLUG}.png`)

const logger = pino({ level: 'silent' })

// Rede de segurança: nada de erro solto derrubar o processo (cair = sessão sai de
// sincronia e precisa de QR de novo).
process.on('unhandledRejection', (e) => console.error('[pix] rejeicao nao tratada:', e))
process.on('uncaughtException', (e) => console.error('[pix] excecao nao tratada (seguindo):', e))

// ---------------------------------------------------------------- chave do PIX
// A chave NÃO está na conta chamada "PIX" (ela está vazia). A chave de verdade
// mora na conta bancária da loja (PagBank), em contas.chave_pix. Cache de 10 min:
// evita ir no banco a cada mensagem, e chave trocada no app vale em até 10 min.
const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
let cache = null // { chave, titular, em }

async function chavePix() {
  if (cache && Date.now() - cache.em < 10 * 60 * 1000) return cache
  const { data, error } = await sb.from('contas')
    .select('nome, chave_pix, titular')
    .eq('loja_id', LOJA.id)
    .not('chave_pix', 'is', null)
    .order('nome')
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[pix] falha ao ler a chave no Supabase:', error.message)
    return cache // segue com o que já tinha, se tinha
  }
  if (!data?.chave_pix) {
    if (!cache) console.error(`[pix] nenhuma conta de ${LOJA.nome} tem chave PIX cadastrada — não vou responder nada até cadastrarem`)
    return null
  }
  cache = { chave: data.chave_pix, titular: data.titular || null, em: Date.now() }
  console.log(`[pix] chave carregada (${data.nome}): ${cache.chave}`)
  return cache
}

// ------------------------------------------------------------- o que é "pix"
// Só entra aqui pergunta de pagamento. Nada de "chave" solta (é ambíguo demais).
export function ehPerguntaPix(texto) {
  const t = (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!t.trim()) return false
  if (/\bchave\s+(pix|pra pagar)\b/.test(t)) return true
  return /\bpix\b/.test(t) || /\bqrcode\b/.test(t) || /\bqr code\b/.test(t)
}

export function resposta(p) {
  return `💠 Chave PIX da loja:\n${p.chave}${p.titular ? `\nTitular: ${p.titular}` : ''}\n\nEnvie o comprovante completo e atenção ao nome do PIX. Obrigado!`
}

// ------------------------------------------------------------ sessão WhatsApp
let conectado = false
let sockAtual = null
let geracao = 0
let recuperando = false
let tentativasSemSessao = 0
let quedas = 0
let respondidas = 0

const esperaQueda = (n) => Math.min(5000 * Math.pow(2, n), 30 * 60 * 1000) // 5s → 30min
const esperaSemSessao = (n) => Math.min(2000 * Math.pow(2, n - 1), 20000) // 2s → 20s (QR fresco)
// Códigos que significam "a credencial morreu" (só 401 saiu da conta de verdade;
// 405/409/412/440 são recusas do servidor que exigem pareamento novo).
// 500 NÃO entra: é falha de stream (transitória, às vezes um engasgo de rede) e
// apagá-la transformava um engasgo em QR obrigatório — o bot parava de responder
// e ninguém sabia até alguém escanear de novo (25/11/2026). Com 500 fora, o bot
// reconecta com a MESMA credencial e só pede QR quando é 401 de verdade.
const CODIGOS_DEFINITIVOS = new Set([401, 405, 409, 412, 440]) // 403 = banido, fica de fora

// Log repetido é o que enche disco. Cada aviso sai no máximo uma vez por janela.
const ultimoLog = new Map()
function deveLogar(chave, janelaMs) {
  const agora = Date.now()
  if (agora - (ultimoLog.get(chave) || 0) < janelaMs) return false
  ultimoLog.set(chave, agora)
  return true
}

// Dono respondeu na mão = bot sai da conversa por 1h (não responde por cima).
const pausados = new Map()
const PAUSA_MS = 60 * 60 * 1000

async function iniciaSessao() {
  const minhaGeracao = ++geracao
  const criadoEm = Date.now()

  // creds.json corrompido no meio da gravação: restaura do .bak e não pede QR de novo.
  try {
    const creds = JSON.parse(fs.readFileSync(path.join(PASTA_AUTH, 'creds.json'), 'utf8'))
    if (!creds?.me?.id || !creds?.signedIdentityKey) throw new Error('incompleto')
  } catch {
    try {
      const bak = JSON.parse(fs.readFileSync(path.join(PASTA_AUTH, 'creds.json.bak'), 'utf8'))
      if (bak?.me?.id && bak?.signedIdentityKey) {
        fs.writeFileSync(path.join(PASTA_AUTH, 'creds.json'), JSON.stringify(bak))
        console.log('[pix] creds corrompido — restaurado do backup (sem QR)')
      }
    } catch {}
  }

  const { state, saveCreds } = await useMultiFileAuthState(PASTA_AUTH)
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version, auth: state, logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'), // Chrome normal; o padrão 'Baileys' cai mais
  })

  const idsEnviados = new Set()
  const _send = sock.sendMessage.bind(sock)
  sock.sendMessage = async (jid, content, ...rest) => {
    const res = await _send(jid, content, ...rest)
    const id = res?.key?.id
    if (id) { idsEnviados.add(id); if (idsEnviados.size > 300) { let n = 0; for (const k of idsEnviados) { idsEnviados.delete(k); if (++n >= 150) break } } }
    return res
  }

  // Dois vínculos abertos na mesma pasta = WhatsApp troca o vínculo e pede QR.
  if (sockAtual) { try { sockAtual.end?.(new Error('substituido')) } catch {} }
  sockAtual = sock

  // Gravação de creds serializada (EBUSY corrompe o arquivo e derruba a sessão).
  let fila = Promise.resolve()
  sock.ev.on('creds.update', () => {
    fila = fila.then(() => saveCreds())
      .then(() => { try { fs.copyFileSync(path.join(PASTA_AUTH, 'creds.json'), path.join(PASTA_AUTH, 'creds.json.bak')) } catch {} })
      .catch((e) => console.error('[pix] falha ao salvar credenciais:', e?.message || e))
  })

  let fechando = false
  let recebeuQr = false // socket de pareamento: QR recebido = socket saudável (só falta escanear)

  // Rede de proteção: socket que nem abre nem fecha (aconteceu em 25/11, depois do
  // 515 do pareamento) deixa o processo "online" e o bot mudo pra sempre. 90s sem
  // abrir e sem QR = derruba e refaz.
  const vigia = setTimeout(() => {
    if (minhaGeracao !== geracao || conectado || recebeuQr) return
    console.error('[pix] 90s sem conectar — derrubando o socket e tentando de novo')
    try { sock.end?.(new Error('nao abriu')) } catch {}
    iniciaSessao().catch((e) => console.error('[pix] falha ao reconectar:', e?.message || e))
  }, 90 * 1000)
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      recebeuQr = true
      QRCode.toFile(ARQ_QR, qr, { width: 512, margin: 2 })
        .then(() => { if (deveLogar('qr', 60 * 1000)) console.log(`[pix] QR pronto pra escanear: ${ARQ_QR}`) })
        .catch((e) => console.error('[pix] falha ao salvar QR:', e?.message || e))
    }

    if (connection === 'close') {
      if (fechando || minhaGeracao !== geracao) return
      fechando = true
      conectado = false
      sock.ev.removeAllListeners()
      const code = lastDisconnect?.error?.output?.statusCode
      const reconectar = (ms) => setTimeout(() => {
        iniciaSessao().catch((e) => console.error('[pix] falha ao reconectar:', e?.message || e))
      }, ms)

      if (code === 403) {
        console.error('[pix] conta BANIDA pelo WhatsApp (403) — parando. Precisa de número novo.')
        return
      }
      if (CODIGOS_DEFINITIVOS.has(code)) {
        console.error(`[pix] sessão inválida (${code}) — apagando credencial morta e gerando QR novo.`)
        try { for (const f of fs.readdirSync(PASTA_AUTH)) fs.unlinkSync(path.join(PASTA_AUTH, f)) } catch {}
        quedas = 0
        tentativasSemSessao = 0
        reconectar(2000)
        return
      }
      // 515 = "reinicie" — é a resposta NORMAL do WhatsApp quando o pareamento dá
      // certo. Reconecta na hora com a credencial que acabou de ser gravada (sem QR).
      if (code === 515) {
        console.log('[pix] pareamento concluído (515) — reconectando com a credencial salva')
        reconectar(500)
        return
      }
      if (!sock.user) {
        // Aguardando alguém escanear. O pareamento do WhatsApp fecha sozinho em ~2,5 min
        // (408) — reconecta espaçando até 20s, senão martela o servidor e incha o log.
        tentativasSemSessao++
        const espera = esperaSemSessao(tentativasSemSessao)
        if (deveLogar('semSessao', 5 * 60 * 1000)) {
          console.error(`[pix] sem sessão (${code || 'sem código'}) — tentativa ${tentativasSemSessao}, durou ${((Date.now() - criadoEm) / 1000).toFixed(0)}s. Abra ${ARQ_QR} e escaneie.`)
        }
        reconectar(espera)
        return
      }
      quedas++
      const espera = esperaQueda(quedas)
      console.error(`[pix] conexão caiu (${code || 'sem código'}) — reconectando em ${Math.round(espera / 1000)}s (queda ${quedas}).`)
      reconectar(espera)
      return
    }

    if (connection === 'open') {
      if (minhaGeracao !== geracao) { try { sock.end?.(new Error('socket duplicado')) } catch {} return }
      conectado = true
      clearTimeout(vigia)
      quedas = 0
      tentativasSemSessao = 0
      console.log(`[pix] conectado como ${LOJA.nome}. Só responde pergunta de PIX.`)
      chavePix().catch(() => {}) // já deixa a chave quente (e grita no log se não houver)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      const jid = msg.key.remoteJid || ''
      // Mensagem do próprio número: eco do bot ou o DONO respondendo na mão.
      if (msg.key.fromMe) {
        if (idsEnviados.has(msg.key.id)) continue
        const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text
        if (texto) pausados.set(jid, Date.now()) // bot sai da conversa por 1h
        continue
      }
      // Nunca grupo, nunca status/broadcast.
      if (jid.endsWith('@g.us') || jid === 'status@broadcast') continue
      if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) continue

      const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text
      if (!texto || !ehPerguntaPix(texto)) continue // não é PIX: silêncio, sem log de conteúdo

      const pausaAte = pausados.get(jid)
      if (pausaAte && Date.now() - pausaAte < PAUSA_MS) continue
      if (pausaAte) pausados.delete(jid)

      try {
        const p = await chavePix()
        if (!p) continue // sem chave cadastrada: melhor calar do que mandar errado
        await sock.sendMessage(jid, { text: resposta(p) })
        respondidas++
        console.log(`[pix] chave enviada (${respondidas} nesta execução)`)
      } catch (e) {
        console.error('[pix] falha ao responder PIX:', e?.message || e)
      }
    }
  })

  // O Baileys às vezes derruba o WebSocket sem emitir 'close' → bot fica "conectado"
  // e mudo. Olha o ws de verdade a cada minuto.
  setInterval(() => {
    if (recuperando || !conectado || !sockAtual) return
    const ws = sockAtual.ws
    if (ws && typeof ws.isOpen === 'boolean' && !ws.isOpen) {
      recuperando = true
      console.error('[pix] ws fechado sem aviso — reconectando.')
      setTimeout(() => {
        iniciaSessao().catch((e) => console.error('[pix] falha ao reconectar:', e?.message || e)).finally(() => { recuperando = false })
      }, 5000)
    }
  }, 60 * 1000)
}

// Só sobe sozinho quando executado direto (`node bot-whatsapp/pix.mjs`). Importado
// (pelo teste) só entrega as funções puras.
const executadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (executadoDireto) {
  console.log(`[pix] bot de PIX — loja ${LOJA.nome} (pasta auth_${SLUG})`)
  iniciaSessao().catch((e) => {
    console.error('[pix] não consegui iniciar a sessão:', e?.message || e)
    process.exit(1)
  })
}
