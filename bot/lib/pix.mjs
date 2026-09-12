import { env } from './env.mjs'

// Conferência de PIX do sistema (Supabase) x comprovantes do grupo.
// O bot é local (SQLite) e não conhecia o PDV; este módulo puxa os pagamentos
// PIX do dia direto do Supabase e casa por VALOR com os comprovantes já lidos.
const URL = env('NEXT_PUBLIC_SUPABASE_URL')
const KEY = env('SUPABASE_SERVICE_ROLE_KEY')

async function supabasePixDoDia() {
  if (!URL || !KEY) return { ok: false, motivo: 'sem credencial do Supabase no .env.local' }
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const inicio = encodeURIComponent(hoje + 'T00:00:00-03:00')
  const h = { apikey: KEY, Authorization: 'Bearer ' + KEY }
  try {
    const formas = await (await fetch(URL + '/rest/v1/formas_pagamento?select=id&tipo=eq.pix', { headers: h })).json()
    const pixIds = (Array.isArray(formas) ? formas : []).map((f) => f.id)
    if (!pixIds.length) return { ok: true, pix: [] }
    const pags = await (await fetch(URL + '/rest/v1/pagamentos_venda?select=venda_id,valor,forma_pagamento_id&status=eq.pago&created_at=gte.' + inicio, { headers: h })).json()
    const pix = (Array.isArray(pags) ? pags : []).filter((p) => pixIds.includes(p.forma_pagamento_id))
    const ids = [...new Set(pix.map((p) => p.venda_id))]
    const vendas = ids.length ? await (await fetch(URL + '/rest/v1/vendas?select=id,pessoas(nome)&id=in.(' + ids.join(',') + ')', { headers: h })).json() : []
    const nomePorVenda = Object.fromEntries((Array.isArray(vendas) ? vendas : []).map((v) => [v.id, (v.pessoas && v.pessoas.nome) || null]))
    return { ok: true, pix: pix.map((p) => ({ valor: Number(p.valor) || 0, cliente: nomePorVenda[p.venda_id] ?? null })) }
  } catch (e) {
    return { ok: false, motivo: String(e && e.message || e).slice(0, 80) }
  }
}

// mesmo matching guloso por valor do painel (lib/pix-pendentes.ts)
export function pixSemComprovante(pix, comprovantes) {
  const disponiveis = comprovantes.map((c) => Number(c.valor) || 0).filter((v) => v > 0)
  const usado = new Array(disponiveis.length).fill(false)
  const pendentes = []
  for (const p of pix) {
    const idx = disponiveis.findIndex((v, i) => !usado[i] && Math.abs(v - p.valor) < 0.005)
    if (idx === -1) pendentes.push(p)
    else usado[idx] = true
  }
  return pendentes
}

// comprovantes válidos do período -> { pendentes } | { erro }
export async function pixPendentesDoPeriodo(comprovantes) {
  const r = await supabasePixDoDia()
  if (!r.ok) return { erro: r.motivo }
  return { pendentes: pixSemComprovante(r.pix, comprovantes) }
}
