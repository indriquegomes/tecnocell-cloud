// FECHA O CASO DA LARISSA (R$ 141,00) e registra os "donos da conta" que receberam.
//
//   node --env-file=.env.local scripts/fechar-larissa-141.mjs            (ensaio)
//   node --env-file=.env.local scripts/fechar-larissa-141.mjs --aplicar  (grava)
//   node --env-file=.env.local scripts/fechar-larissa-141.mjs --desfazer (volta)
//
// O que o dono confirmou (26/11/2026):
//   LARISSA PLAY TEC (cliente no app)  → recebe pela conta de LARISSA DA ROCHA CARVALHO
//   DIEGO SANTOS     (cliente no app)  → recebe pela conta de LUIZ DIEGO DOS SANTOS SILVA
//
// Com isso, a conta de R$ 141,00 que estava no nome do Diego é o reembolso do RELÓGIO
// devolvido pela LARISSA PLAY TEC (devolução d5c25934, venda #14217), e o PIX de
// R$ 141,00 do extrato (19/11, para Larissa da Rocha Carvalho) é esse pagamento.
//
// O que muda:
//   conta 5367b62e : pessoa_nome → LARISSA PLAY TEC · pessoa_id · devolucao_id ·
//                    data_pagamento → 19/11 · descrição com o nome da conta que recebeu
//   devolução      : sem_reembolso → pix, reembolso [{pix, 141}]
//   pessoa_chaves_pix: registra os dois "nomes no comprovante" para os próximos meses
import fs from 'node:fs'
import path from 'node:path'

const CONTA_PREFIXO = '5367b62e'
const VENDA_NUMERO = 14217
const VALOR = 141

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const desfazer = process.argv.includes('--desfazer')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => { const r = await fetch(`${url}/rest/v1/${p}`, { headers: h }); const j = await r.json(); return Array.isArray(j) ? j : [] }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

const contas = await get(`lancamentos?select=id,valor,descricao,pessoa_nome,pessoa_id,forma_pagamento,conta_id,data_pagamento,devolucao_id,status&tipo=eq.pagar&valor=eq.${VALOR}&or=(descricao.ilike.*Diego*,descricao.ilike.*LARISSA*)`)
const conta = contas.find((c) => c.id.startsWith(CONTA_PREFIXO))
const larissa = (await get(`pessoas?select=id,nome&nome=ilike.*LARISSA PLAY*`))[0]
const venda = (await get(`vendas?select=id,numero,total&numero=eq.${VENDA_NUMERO}`))[0]
const devs = await get(`devolucoes?select=id,valor_total,tipo_credito,reembolsos&venda_id=eq.${venda?.id}`)
const dev = devs.find((d) => Math.abs(Number(d.valor_total) - VALOR) < 0.011)
if (!conta || !larissa || !dev) { console.error('não achei conta/pessoa/devolução'); process.exit(1) }

const descricaoNova = 'Devolução — LARISSA PLAY TEC (relógio devolvido, pago em PIX para Larissa da Rocha Carvalho)'
console.log(`\nANTES`)
console.log(`  conta     : '${conta.descricao}'`)
console.log(`              ${brl(conta.valor)} · ${conta.status} · ${conta.forma_pagamento} · conta=${conta.conta_id ? 'PagBank' : '—'} · pag=${String(conta.data_pagamento).slice(0, 10)} · pessoa=${conta.pessoa_nome ?? '—'} · dev=${conta.devolucao_id ?? '—'}`)
console.log(`  devolução : ${dev.id.slice(0, 8)} · ${brl(dev.valor_total)} · ${dev.tipo_credito} · reembolsos=${JSON.stringify(dev.reembolsos)}`)
console.log(`  cliente   : ${larissa.nome} · ${larissa.id}`)

if (!aplicar && !desfazer) {
  console.log(`\n(ensaio: nada gravado. --aplicar fecha · --desfazer volta)`)
  process.exit(0)
}

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `fechar-larissa-141-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify({
  conta_id: conta.id,
  antes: {
    conta: { descricao: conta.descricao, pessoa_nome: conta.pessoa_nome, pessoa_id: conta.pessoa_id, data_pagamento: conta.data_pagamento, devolucao_id: conta.devolucao_id },
    devolucao: { tipo_credito: dev.tipo_credito, reembolsos: dev.reembolsos },
  },
  obs: 'dono confirmou: LARISSA PLAY TEC recebe pela conta de Larissa da Rocha Carvalho; DIEGO SANTOS pela de Luiz Diego dos Santos Silva',
}, null, 2), 'utf8')
console.log(`\nbackup: ${arquivo}`)

const corpoConta = desfazer
  ? { descricao: conta.descricao, pessoa_nome: conta.pessoa_nome, pessoa_id: conta.pessoa_id, data_pagamento: conta.data_pagamento, devolucao_id: conta.devolucao_id }
  : {
      descricao: descricaoNova,
      pessoa_nome: 'LARISSA PLAY TEC',
      pessoa_id: larissa.id,
      devolucao_id: dev.id,
      data_pagamento: '2026-11-19T12:00:00-03:00',
      updated_at: new Date().toISOString(),
    }
const corpoDev = desfazer
  ? { tipo_credito: 'sem_reembolso', reembolsos: [{ tipo: 'sem_reembolso', valor: VALOR }] }
  : { tipo_credito: 'pix', reembolsos: [{ tipo: 'pix', valor: VALOR }] }

const r1 = await fetch(`${url}/rest/v1/lancamentos?id=eq.${conta.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoConta) })
const r2 = await fetch(`${url}/rest/v1/devolucoes?id=eq.${dev.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoDev) })

// registra os donos das contas que recebem, para os próximos meses
const chaves = [
  { pessoa_nome: 'LARISSA PLAY TEC', favorecido: 'Larissa da Rocha Carvalho' },
  { pessoa_nome: 'DIEGO SANTOS', favorecido: 'Luiz Diego Dos Santos Silva' },
]
let chavesOk = 0
for (const c of chaves) {
  const pessoa = (await get(`pessoas?select=id,nome&nome=ilike.*${encodeURIComponent(c.pessoa_nome)}*`))[0]
  if (!pessoa) continue
  const jaTem = await get(`pessoa_chaves_pix?select=id&pessoa_id=eq.${pessoa.id}&favorecido=ilike.*${encodeURIComponent(c.favorecido.slice(0, 12))}*`)
  if (desfazer) {
    for (const j of jaTem) await fetch(`${url}/rest/v1/pessoa_chaves_pix?id=eq.${j.id}`, { method: 'DELETE', headers: h })
    continue
  }
  if (jaTem.length) continue
  const r = await fetch(`${url}/rest/v1/pessoa_chaves_pix`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ id: crypto.randomUUID(), pessoa_id: pessoa.id, tipo: 'Nome no comprovante', favorecido: c.favorecido, ativo: true }),
  })
  if (r.ok) chavesOk++
}
console.log(`conta ok=${r1.ok} · devolução ok=${r2.ok} · nomes de comprovante registrados=${chavesOk}`)

const dc = (await get(`lancamentos?select=descricao,pessoa_nome,pessoa_id,data_pagamento,devolucao_id&id=eq.${conta.id}`))[0]
const dd = (await get(`devolucoes?select=tipo_credito,reembolsos&id=eq.${dev.id}`))[0]
console.log(`\nDEPOIS`)
console.log(`  conta     : '${dc.descricao}'`)
console.log(`              ${dc.pessoa_nome} · pag=${String(dc.data_pagamento).slice(0, 10)} · dev=${dc.devolucao_id ?? '—'}`)
console.log(`  devolução : ${dd.tipo_credito} · ${JSON.stringify(dd.reembolsos)}`)
