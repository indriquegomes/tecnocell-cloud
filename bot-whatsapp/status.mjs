// Situação do bot de atendimento num comando: node bot-whatsapp/status.mjs
// Só LÊ (credencial, heartbeat, QR, log do PM2 e o log local de conversas).
// Não conecta no WhatsApp, não escreve no banco, não reinicia nada.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { RAIZ_REPO, env } from '../bot/lib/env.mjs'

const DIR = path.join(RAIZ_REPO, 'bot-whatsapp', 'data')
const LOGS = path.join(process.env.USERPROFILE || '', '.pm2', 'logs')
const linha = (rotulo, valor) => console.log(`${rotulo.padEnd(22)} ${valor}`)
const idadeMin = (ms) => (Date.now() - ms) / 60000

function le(nome) {
  try { return fs.statSync(path.join(DIR, nome)) } catch { return null }
}

// Processo no PM2 (restarts, uptime, status). pm2 jlist devolve JSON.
let pm2 = null
try {
  pm2 = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8' })).find((p) => p.name === 'tecnocell-bot')
} catch { /* PM2 fora do ar */ }

const creds = (() => {
  for (const pasta of fs.readdirSync(DIR).filter((f) => f.startsWith('auth_'))) {
    const arq = path.join(DIR, pasta)
    if (!fs.statSync(arq).isDirectory()) continue
    const temCreds = fs.existsSync(path.join(arq, 'creds.json'))
    return { pasta, temCreds, arquivos: fs.readdirSync(arq).length }
  }
  return null
})()

const hb = le('heartbeat.txt')
const hbMs = hb ? Number(fs.readFileSync(path.join(DIR, 'heartbeat.txt'), 'utf8')) : null
const qr = le('qr_petropolis.png')
const logOut = (() => { try { return fs.statSync(path.join(LOGS, 'tecnocell-bot-out.log')) } catch { return null } })()
const logErr = (() => { try { return fs.statSync(path.join(LOGS, 'tecnocell-bot-error.log')) } catch { return null } })()

console.log('\n=== BOT WHATSAPP — SITUAÇÃO ===\n')
linha('Processo (PM2):', pm2
  ? `${pm2.pm2_env.status} · uptime ${Math.round((Date.now() - pm2.pm2_env.pm_uptime) / 60000)} min · ${pm2.pm2_env.restart_time} restart(s) · pid ${pm2.pid}`
  : 'NÃO ESTÁ NO AR (pm2 fora do ar ou processo inexistente)')
linha('Loja configurada:', pm2?.pm2_env?.BOT_WHATSAPP_LOJA || env('BOT_WHATSAPP_LOJA') || '(nenhuma — ligaria todas)')
linha('Sessão salva:', creds ? `${creds.pasta} — ${creds.temCreds ? 'creds.json presente' : 'SEM creds.json'} (${creds.arquivos} arquivos)` : 'nenhuma pasta auth_*')
linha('Prova de vida:', hbMs ? `${Math.round(idadeMin(hbMs))} min atrás` : 'nunca gravada')
linha('QR gerado:', qr ? `${Math.round(idadeMin(qr.mtimeMs))} min atrás (${Math.round(qr.size / 1024)} KB)` : 'nenhum')
linha('Log PM2:', `out ${logOut ? (logOut.size / 1048576).toFixed(1) + ' MB' : '—'} · err ${logErr ? (logErr.size / 1048576).toFixed(1) + ' MB' : '—'}`)
linha('Chave DeepSeek:', env('DEEPSEEK_API_KEY') ? 'configurada' : 'FALTANDO (.env.local) — bot sobe mudo')

// Conversas gravadas no log local (telefone truncado). Mostra os últimos dias.
try {
  const db = new DatabaseSync(path.join(DIR, 'bot-whatsapp.db'), { readOnly: true })
  const total = db.prepare('select count(*) c from conversas').get().c
  const dias = db.prepare("select substr(criado_em,1,10) dia, count(*) n from conversas group by dia order by dia desc limit 5").all()
  const ultima = db.prepare('select max(criado_em) m from conversas').get().m
  linha('Conversas no log:', `${total} · última em ${ultima}`)
  for (const d of dias) console.log(`${''.padEnd(22)} ${d.dia}: ${d.n}`)
} catch { /* sem banco ainda */ }

console.log('')
if (creds && !creds.temCreds) {
  console.log('>>> Sem credencial: o bot NÃO conecta sozinho. Abra e escaneie:')
  console.log('    ' + path.join(DIR, 'qr_petropolis.png'))
  console.log('    (WhatsApp da loja → Aparelhos conectados → Conectar um aparelho)\n')
} else if (pm2 && pm2.pm2_env.status === 'online') {
  console.log('>>> Processo no ar. Se o cliente reclamar de silêncio, olhe o log de erro, não o de saída.\n')
}
