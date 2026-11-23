// SÓ LEITURA — extrato completo dos clientes com saldo de vale negativo, linha por linha,
// para achar o que está deixando o saldo abaixo de zero.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = (x) => (x ?? '').slice(0, 16).replace('T', ' ')
async function fetchAll(q) { const o = []; for (let i = 0; i < 500000; i += 1000) { const { data, error } = await q(i, i + 999); if (error) throw new Error(error.message); if (!data || !data.length) break; o.push(...data); if (data.length < 1000) break } return o }

const cr = await fetchAll((f, t) => s.from('creditos_clientes')
  .select('id, pessoa_id, pessoa_nome, loja_id, tipo, valor, descricao, devolucao_id, venda_id, lancamento_id, estorna_credito_id, created_at')
  .order('id').range(f, t))
const saldo = new Map()
for (const c of cr) {
  const k = (c.pessoa_id ?? 'sem') + '|' + (c.loja_id ?? '')
  const atual = saldo.get(k) ?? { nome: c.pessoa_nome, v: 0, linhas: [] }
  const sinal = (c.tipo === 'uso' || c.tipo === 'estorno') ? -1 : 1
  atual.v += sinal * Number(c.valor || 0)
  atual.linhas.push({ ...c, efeito: sinal * Number(c.valor || 0) })
  saldo.set(k, atual)
}

const negativos = [...saldo.entries()].filter(([, v]) => v.v < -0.01)
console.log(`clientes com saldo negativo: ${negativos.length}\n`)
for (const [k, v] of negativos) {
  console.log(`=== ${v.nome} (${k.split('|')[0].slice(0, 8)}) — saldo R$ ${brl(v.v)} ===`)
  let acumulado = 0
  for (const l of v.linhas.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))) {
    acumulado += l.efeito
    const ref = [
      l.devolucao_id ? 'dev=' + l.devolucao_id.slice(0, 8) : '',
      l.venda_id ? 'venda=' + l.venda_id.slice(0, 8) : '',
      l.lancamento_id ? 'lanc=' + l.lancamento_id.slice(0, 8) : '',
      l.estorna_credito_id ? 'estorna_credito=' + l.estorna_credito_id.slice(0, 8) : '',
    ].filter(Boolean).join(' ')
    console.log(`  ${dia(l.created_at)} ${String(l.tipo).padEnd(8)} ${brl(l.valor).padStart(9)} → acumulado ${brl(acumulado).padStart(10)}  ${String(l.descricao ?? '').slice(0, 44)} ${ref}`)
  }
  console.log('')
}

// O estorno aponta para o crédito que cancela? E esse crédito já foi usado?
console.log('=== estornos que apontam para crédito já consumido ===')
for (const c of cr.filter((x) => x.tipo === 'estorno')) {
  if (!c.estorna_credito_id) { console.log(`  estorno ${brl(c.valor)} ${String(c.pessoa_nome).slice(0, 28)} SEM estorna_credito_id — ${String(c.descricao ?? '').slice(0, 40)}`); continue }
  const alvo = cr.find((x) => x.id === c.estorna_credito_id)
  const usos = cr.filter((x) => x.pessoa_id === c.pessoa_id && x.tipo === 'uso' && (x.created_at ?? '') > (alvo?.created_at ?? '') && (x.created_at ?? '') <= (c.created_at ?? ''))
  const usado = usos.reduce((t, u) => t + Number(u.valor || 0), 0)
  console.log(`  estorno ${brl(c.valor).padStart(8)} de ${String(c.pessoa_nome).slice(0, 26).padEnd(26)} · crédito alvo ${alvo ? brl(alvo.valor) : '(não achei)'} · usos depois do crédito e antes do estorno: ${brl(usado)}`)
}
