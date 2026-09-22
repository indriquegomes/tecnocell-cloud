// Vigia do bot WhatsApp: se a prova de vida (heartbeat.txt) ficar velha demais,
// reinicia o processo. Roda como app separado no PM2 (tecnocell-bot-monitor).
// Sem custo, sem mexer na sessão do WhatsApp (só reinicia o processo — as
// credenciais ficam no disco). Best-effort: se o pm2 CLI falhar, loga e tenta de novo.
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ARQ = path.join(DIR, 'data', 'heartbeat.txt')
const LIMITE_MS = 15 * 60 * 1000 // 15 min sem sinal = travado
const INTERVALO_MS = 5 * 60 * 1000 // checa a cada 5 min

function checar() {
  let t = null
  try { t = Number(fs.readFileSync(ARQ, 'utf8')) } catch { /* sem arquivo ainda */ }
  // Sem heartbeat = bot começando (não reinicia). Só reinicia se o arquivo EXISTE
  // e está velho — aí sim é sinal de travamento.
  if (t === null || !Number.isFinite(t)) return
  if (Date.now() - t > LIMITE_MS) {
    console.log(`[monitor] ${new Date().toISOString()} heartbeat velho — reiniciando tecnocell-bot`)
    exec('pm2 restart tecnocell-bot', (err, stdout) => {
      if (err) console.error('[monitor] falha ao reiniciar:', err.message)
      else console.log('[monitor] ok:', (stdout || '').trim())
    })
  }
}

checar()
setInterval(checar, INTERVALO_MS)
