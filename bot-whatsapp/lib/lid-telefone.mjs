import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { env, RAIZ_REPO } from '../../bot/lib/env.mjs'

// WhatsApp novo entrega o remetente como @lid (ID anônimo), não o número de
// telefone. O caminho confiável do Baileys é o INVERSO: onWhatsApp(telefone)
// devolve o lid do número. Então construímos o mapa lid -> telefone consultando
// todos os clientes cadastrados (pessoas) uma vez, e persistimos num JSON pra
// sobreviver a restart. Mensagem que chega de um lid conhecido casa com o
// cliente; lid desconhecido cai no varejo (comportamento desejado).

const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
const ARQ = path.join(RAIZ_REPO, 'bot-whatsapp', 'data', 'lid-telefone.json')
const ARQ_NOMES = path.join(RAIZ_REPO, 'bot-whatsapp', 'data', 'lid-nome.json')

const mapa = new Map()
try {
  const txt = fs.readFileSync(ARQ, 'utf8')
  for (const [k, v] of Object.entries(JSON.parse(txt))) mapa.set(k, v)
} catch { /* primeira vez: sem arquivo */ }

// Nome de exibição do contato no WhatsApp (pra identificar @lid sem cadastro).
const nomes = new Map()
try {
  const txt = fs.readFileSync(ARQ_NOMES, 'utf8')
  for (const [k, v] of Object.entries(JSON.parse(txt))) nomes.set(k, v)
} catch { /* primeira vez: sem arquivo */ }

let agendado = false
function salvar() {
  if (agendado) return
  agendado = true
  setImmediate(() => {
    agendado = false
    try { fs.writeFileSync(ARQ, JSON.stringify(Object.fromEntries(mapa))) }
    catch (e) { console.error('[lid-telefone] falha ao salvar:', e?.message || e) }
    try { fs.writeFileSync(ARQ_NOMES, JSON.stringify(Object.fromEntries(nomes))) }
    catch (e) { console.error('[lid-telefone] falha ao salvar nomes:', e?.message || e) }
  })
}

// telefone BR -> formato internacional pra onWhatsApp (55 + DDD + número).
// Número truncado (DDD + menos de 8 dígitos) não tem como completar -> null.
function normalizaParaWhatsApp(t) {
  const d = String(t || '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) return d
  if (d.length >= 10 && d.length <= 11) return '55' + d
  return null
}

// c é o Contact do Baileys: { id, lid, jid, name, notify }. Se vier com telefone
// (jid @s.whatsapp.net), aprende a dupla lid <-> telefone sem custo.
export function aprendeContato(c) {
  if (!c) return
  const lids = new Set()
  if (c.lid) lids.add(String(c.lid).replace(/@lid$/, '').split(':')[0])
  if (String(c.id || '').endsWith('@lid')) lids.add(String(c.id).slice(0, -4).split(':')[0])
  if (lids.size === 0) return
  const nome = c.name || c.notify || null
  const jid = c.jid || (String(c.id || '').endsWith('@s.whatsapp.net') ? c.id : null)
  const tel = jid ? String(jid).replace(/@s\.whatsapp\.net$/, '').split(':')[0] : null
  for (const lid of lids) {
    if (!lid) continue
    if (tel) {
      if (!mapa.has(lid)) console.log(`[lid-telefone] aprendido por contato: ${lid} -> ${tel}`)
      mapa.set(lid, tel)
    }
    if (nome && !nomes.has(lid)) nomes.set(lid, nome)
  }
  salvar()
}

// pushName de cada mensagem: nome de exibição que o próprio WhatsApp entrega em
// toda conversa. Mais confiável que contato salvo pra identificar @lid novo.
export function aprendeNome(jid, nome) {
  if (!nome) return
  const j = String(jid || '')
  if (j.endsWith('@lid')) {
    const lid = j.slice(0, -4).split(':')[0]
    if (!nomes.has(lid)) nomes.set(lid, nome)
    salvar()
  }
}

// Constrói/atualiza o mapa lid -> telefone consultando os clientes cadastrados.
// Roda em background após a conexão (lotes de 100 números por consulta USync).
export async function constroiMapa(sock) {
  const numeros = new Set()
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.from('pessoas').select('telefone, celular').range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const p of data) {
      for (const t of [p.telefone, p.celular]) {
        const n = normalizaParaWhatsApp(t)
        if (n) numeros.add(n)
      }
    }
    if (data.length < 1000) break
    offset += 1000
  }

  const lista = [...numeros]
  let novos = 0
  for (let i = 0; i < lista.length; i += 100) {
    const lote = lista.slice(i, i + 100)
    try {
      const res = await sock.onWhatsApp(...lote)
      for (const r of (res ?? [])) {
        if (!r.exists || !r.lid || !r.jid) continue
        const lid = String(r.lid).replace(/@lid$/, '').split(':')[0]
        const tel = String(r.jid).replace(/@s\.whatsapp\.net$/, '').split(':')[0]
        if (!lid || !tel) continue
        if (!mapa.has(lid)) novos++
        mapa.set(lid, tel)
      }
    } catch (e) {
      console.error('[lid-telefone] lote onWhatsApp falhou:', e?.message || e)
    }
  }
  salvar()
  console.log(`[lid-telefone] mapa construído: ${mapa.size} lids (+${novos} novos)`)
}

// jid -> telefone (só dígitos). @lid resolve do cache; desconhecido -> null.
export function resolveTelefone(jid) {
  const j = String(jid || '')
  if (j.endsWith('@s.whatsapp.net')) return j.slice(0, -'@s.whatsapp.net'.length)
  if (j.endsWith('@lid')) return mapa.get(j.slice(0, -4).split(':')[0]) ?? null
  return j
}

// jid -> nome de exibição do contato (só @lid; @s.whatsapp.net resolve pelo cadastro).
export function resolveNome(jid) {
  const j = String(jid || '')
  if (j.endsWith('@lid')) return nomes.get(j.slice(0, -4).split(':')[0]) ?? null
  return null
}
