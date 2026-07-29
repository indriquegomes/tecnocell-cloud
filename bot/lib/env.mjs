import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// O bot local reusa o .env.local da raiz do repo — nada de copiar segredo pra outro arquivo.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ARQ = process.env.BOT_ENV_FILE || path.join(RAIZ, '.env.local')

// dotenv de bolso: aguenta valor entre aspas com \n dentro e valor multi-linha (GOOGLE_SA_JSON).
function parse(txt) {
  const out = {}
  const n = txt.length
  let i = 0
  while (i < n) {
    while (i < n && /\s/.test(txt[i])) i++
    if (i >= n) break
    const nl0 = txt.indexOf('\n', i)
    const fimLinha = nl0 < 0 ? n : nl0
    if (txt[i] === '#') { i = fimLinha + 1; continue }
    const eq = txt.indexOf('=', i)
    if (eq < 0 || eq > fimLinha) { i = fimLinha + 1; continue }
    const chave = txt.slice(i, eq).trim().replace(/^export\s+/, '')
    let j = eq + 1
    while (j < n && (txt[j] === ' ' || txt[j] === '\t')) j++
    const q = txt[j]
    if (q === '"' || q === "'") {
      j++
      let val = '', esc = false
      for (; j < n; j++) {
        const ch = txt[j]
        // Aspas SIMPLES são literais (igual dotenv): a barra invertida faz parte do valor.
        // Tratar escape aqui destruía a private_key do Google — `\n` virava `n` e o PEM
        // ficava numa linha só ("DECODER routines::unsupported" na hora de assinar).
        if (q === "'") { if (ch === q) { j++; break } val += ch; continue }
        if (esc) { val += ({ n: '\n', r: '\r', t: '\t' }[ch] ?? ch); esc = false; continue }
        if (ch === '\\') { esc = true; continue }
        if (ch === q) { j++; break }
        val += ch
      }
      out[chave] = val
      const nl = txt.indexOf('\n', j)
      i = nl < 0 ? n : nl + 1
    } else {
      out[chave] = txt.slice(j, fimLinha).trim()
      i = fimLinha + 1
    }
  }
  return out
}

if (fs.existsSync(ARQ)) {
  const vals = parse(fs.readFileSync(ARQ, 'utf8'))
  for (const k of Object.keys(vals)) if (process.env[k] == null || process.env[k] === '') process.env[k] = vals[k]
} else {
  console.error('[env] nao achei', ARQ)
}

export const env = (k, def = '') => process.env[k] || def

// O bot v2 escreve em ABAS PRÓPRIAS. As abas originais ("Petrópolis"/"Teresópolis")
// ficam paradas, do jeito que o bot antigo deixou. Trocável por env sem mexer no código.
export const LOJAS = [
  { slug: 'petropolis', aba: env('BOT_ABA_PETROPOLIS', 'Petrópolis v2'), token: env('TELEGRAM_TOKEN_PETROPOLIS'), grupo: Number(env('TELEGRAM_GRUPO_PETROPOLIS', '0')) },
  { slug: 'teresopolis', aba: env('BOT_ABA_TERESOPOLIS', 'Teresópolis v2'), token: env('TELEGRAM_TOKEN_TERESOPOLIS'), grupo: Number(env('TELEGRAM_GRUPO_TERESOPOLIS', '0')) },
].filter((l) => l.token && l.grupo)

export const SHEET_ID = env('COMPROVANTES_SHEET_ID')
export const MODELO = env('COMPROVANTE_MODELO', 'claude-haiku-4-5')
export const RAIZ_REPO = RAIZ
