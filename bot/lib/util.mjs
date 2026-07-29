export const money = (v) => Number(v || 0).toFixed(2).replace('.', ',')
export const agora = () => new Date().toISOString()
export const dorme = (ms) => new Promise((r) => setTimeout(r, ms))

export function parseValor(t) {
  if (t == null) return null
  let s = String(t).replace(/r\$/i, '').replace(/[^\d.,]/g, '').trim()
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const v = parseFloat(s)
  return isNaN(v) ? null : v
}

// O E2E não tem espaço — mas a IA lê com espaço/caractere invisível em posição aleatória.
// Sem limpar, o MESMO Pix reenviado gera "ids diferentes" e o dedup não pega.
export const limpaId = (id) => { const s = String(id ?? '').replace(/[^A-Za-z0-9]/g, ''); return s || null }

// data do Pix embutida no E2E (E + ISPB8 + AAAAMMDD + HHMM + random)
export function dataDoId(id) {
  const m = String(id || '').match(/^E(\d{8})(\d{8})(\d{4})/)
  if (!m) return null
  const d = m[2], y = +d.slice(0, 4), mo = +d.slice(4, 6), da = +d.slice(6, 8)
  if (y < 2020 || y > 2035 || mo < 1 || mo > 12 || da < 1 || da > 31) return null
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

export const diaDiff = (a, b) => (!a || !b ? 999 : Math.abs((+new Date(a + 'T12:00:00') - +new Date(b + 'T12:00:00')) / 86400000))

export function resolveData(dataID, dataOCR, recebidoISO) {
  const rec = recebidoISO ? String(recebidoISO).slice(0, 10) : null
  const cands = [dataID, dataOCR].filter(Boolean)
  if (!cands.length) return rec
  let best = cands[0]
  if (rec) for (const d of cands) if (diaDiff(d, rec) < diaDiff(best, rec)) best = d
  if (rec) {
    const b = best.split('-'), r = rec.split('-')
    if (b[1] === r[1] && b[2] === r[2] && b[0] !== r[0]) return rec // ano errado de OCR
  }
  return best
}

export const fmtDataBR = (d) => {
  if (!d) return ''
  const p = String(d).slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d)
}

export const normNome = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

// Agrupa por destinatário: mesmo nome, mesmo CNPJ, ou um nome é prefixo do outro
// ("ATOSCEL COMERCIO" x "ATOSCEL COMERCIO DE CELULARES"). Union-find.
export function agrupaPorDestino(lista) {
  const list = lista || [], N = list.length
  const parent = list.map((_, i) => i)
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  const nn = list.map((c) => normNome(c.destinatario))
  const doc = list.map((c) => { const d = String(c.destinatario_doc || '').replace(/\D/g, ''); return d.length === 14 ? d : '' })
  const porNome = {}, porDoc = {}
  list.forEach((_, i) => { if (nn[i]) { if (porNome[nn[i]] != null) uni(i, porNome[nn[i]]); else porNome[nn[i]] = i } })
  list.forEach((_, i) => { if (doc[i]) { if (porDoc[doc[i]] != null) uni(i, porDoc[doc[i]]); else porDoc[doc[i]] = i } })
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const a = nn[i], b = nn[j]
    if (a.length >= 10 && b.length >= 10 && (a.startsWith(b) || b.startsWith(a))) uni(i, j)
  }
  const baldes = {}
  list.forEach((c, i) => { const r = find(i); (baldes[r] = baldes[r] || []).push(c) })
  const g = {}
  for (const r of Object.keys(baldes)) {
    const itens = baldes[r]
    const cont = {}; let best = '', bestSc = -1
    for (const c of itens) {
      const nome = (c.destinatario || '').trim()
      if (!nome) continue
      cont[nome] = (cont[nome] || 0) + 1
      const sc = cont[nome] * 1000 + nome.length
      if (sc > bestSc) { bestSc = sc; best = nome }
    }
    g[(normNome(best) || 'SEM DESTINATARIO') + '#' + r] = { nome: best || 'SEM DESTINATÁRIO', itens }
  }
  return g
}

// A IA às vezes emite o JSON e continua falando depois. Pega o PRIMEIRO {...} balanceado.
export function primeiroJson(txt) {
  const s = (txt || '').indexOf('{')
  if (s < 0) return null
  let depth = 0, inStr = false, esc = false
  for (let i = s; i < txt.length; i++) {
    const ch = txt[i]
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false }
    else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') { if (--depth === 0) { try { return JSON.parse(txt.slice(s, i + 1)) } catch { return null } } }
  }
  return null
}
