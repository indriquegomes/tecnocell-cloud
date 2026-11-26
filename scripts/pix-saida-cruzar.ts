// CRUZAMENTO — os dois lados do PIX de saída numa página só. SÓ LÊ.
//
//   node --env-file=.env.local --import ./test/alias.mjs scripts/pix-saida-cruzar.ts [dias]
//
// Lado A: prints que chegaram no grupo (pix_saidas) — o que o robô leu e o que achou.
// Lado B: devoluções em PIX pagas no app — quais já têm print e quais estão sem.
//
// É o que mostra, sem abrir tela: onde o banco pagou e o app não sabe, e onde o app
// pagou e não existe comprovante.
import { ehLinhaDeDevolucao, ehSaidaPix, diaDoCampo } from '@/lib/pix-saida'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const DIAS = Number(process.argv[2] ?? 30)
const h = { apikey: key, Authorization: `Bearer ${key}` }
const get = async (caminho: string) => {
  const r = await fetch(`${url}/rest/v1/${caminho}`, { headers: h })
  if (!r.ok) throw new Error(`${caminho}: ${await r.text()}`)
  return r.json()
}
const brl = (v: number) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const diaBR = (d: string | null) => { const x = diaDoCampo(d); return x ? x.split('-').reverse().join('/') : '—' }

const desde = new Date(); desde.setDate(desde.getDate() - DIAS)

// ---------- lado A: prints ----------
const prints = await get(`pix_saidas?select=telegram_message_id,formato,status,valor,dia,pagador,destinatario,transacao_id,lancamento_id,conciliado_por,recebido_em&recebido_em=gte.${desde.toISOString()}&order=recebido_em.desc&limit=500`) as {
  telegram_message_id: number; formato: string; status: string | null; valor: number | null; dia: string | null
  pagador: string | null; destinatario: string | null; transacao_id: string | null; lancamento_id: string | null
  conciliado_por: string | null; recebido_em: string
}[]

console.log(`\n=== LADO A — prints no grupo (últimos ${DIAS} dias): ${prints.length} ===`)
for (const p of prints) {
  const marca = p.lancamento_id ? '🔗 ligado' : p.status === 'sem_par' ? '❌ sem par' : p.status === 'ambiguo' ? '🤔 ambíguo' : `· ${p.status}`
  const quem = p.destinatario ?? '(sem nome)'
  console.log(`  ${marca} | ${brl(Number(p.valor))} | ${diaBR(p.dia)} | ${quem} | ${p.formato}${p.lancamento_id ? ' | conta ' + p.lancamento_id.slice(0, 8) : ''}`)
}

// ---------- lado B: devoluções em PIX pagas ----------
const linhas = await get(`lancamentos?select=id,valor,status,descricao,pessoa_nome,forma_pagamento,data_pagamento,devolucao_id&tipo=eq.pagar&status=eq.pago&data_pagamento=gte.${desde.toISOString().slice(0, 10)}&or=(descricao.ilike.*devolu*,descricao.ilike.*estorno*,devolucao_id.not.is.null)&order=data_pagamento.desc&limit=500`) as {
  id: string; valor: number; status: string | null; descricao: string | null; pessoa_nome: string | null
  forma_pagamento: string | null; data_pagamento: string | null; devolucao_id: string | null
}[]

const ligados = new Set(prints.map((p) => p.lancamento_id).filter(Boolean) as string[])
const devolucoes = linhas.filter((l) => ehLinhaDeDevolucao({ devolucaoId: l.devolucao_id, descricao: l.descricao }) && ehSaidaPix(l.forma_pagamento))
const comProva = devolucoes.filter((l) => ligados.has(l.id))
const semProva = devolucoes.filter((l) => !ligados.has(l.id))

console.log(`\n=== LADO B — devoluções em PIX pagas (últimos ${DIAS} dias): ${devolucoes.length} ===`)
console.log(`  com comprovante ligado: ${comProva.length} (${brl(comProva.reduce((s, l) => s + Number(l.valor), 0))})`)
console.log(`  SEM comprovante:        ${semProva.length} (${brl(semProva.reduce((s, l) => s + Number(l.valor), 0))})`)
for (const l of semProva) {
  const forma = /fora/i.test(String(l.forma_pagamento)) ? ' · ⚠️ fora do app' : ''
  console.log(`  ❌ ${brl(Number(l.valor))} | ${diaBR(l.data_pagamento)} | ${l.pessoa_nome ?? l.descricao}${forma}`)
}

const semPar = prints.filter((p) => !p.lancamento_id && p.status !== 'recebido')
console.log(`\n=== RESUMO ===`)
console.log(`  prints sem conta no app: ${semPar.length} · valor ${brl(semPar.reduce((s, p) => s + Number(p.valor ?? 0), 0))}`)
console.log(`  devoluções sem print:    ${semProva.length} · valor ${brl(semProva.reduce((s, l) => s + Number(l.valor), 0))}`)
console.log(`  (um PIX de cliente ao fornecedor não entra nos dois lados: outra régua)`)
