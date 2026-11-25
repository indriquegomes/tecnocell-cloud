// Arruma o cadastro de CONTAS para o novo mês (decisão do dono, 25/11/2026).
//
// 3+4. "Cofre Petrópolis"/"Cofre Teresópolis" → "Dinheiro vivo Petrópolis"/"Dinheiro vivo Teresópolis".
// 5.   "Cofre PagBank" → "Caixinha PagBank": dinheiro digital que sobrou do mês anterior, guardado
//      no app do PagBank numa caixinha, usado depois (ex.: comissões) sem misturar com o mês atual.
// 1.   Cartão TON: "Crédito TON"/"Débito TON" passam a apontar para a conta única (PagBank
//      Petrópolis). A rota por loja também sai, para o cartão de Teresópolis não cair numa conta
//      arquivada.
// 2.   Forma "Vale Crédito" perde a conta: vale-crédito é saldo do cliente, não é conta.
// 7-12. PagBank Teresópolis, PIX, PIX Teresópolis, TON, TON Teresópolis e VALE CREDITO ficam
//      ARQUIVADAS (inativas + nome com prefixo). NÃO são apagadas de propósito: elas têm mais de
//      4.500 lançamentos históricos apontando para elas e apagar levaria o rastro do dinheiro de
//      setembro/outubro junto. Arquivada some do saldo e não recebe nada novo.
//
// Backup + DESFAZER em docs/registros-banco/<ano-mês>/.
// Uso: node scripts/arrumar-contas.mjs        (aplica)
//      node scripts/arrumar-contas.mjs --ver  (só mostra)
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const soVer = process.argv.includes('--ver')

const RENOMEAR = {
  'Cofre Petrópolis': 'Dinheiro vivo Petrópolis',
  'Cofre Teresópolis': 'Dinheiro vivo Teresópolis',
  'Cofre PagBank': 'Caixinha PagBank',
}
const ARQUIVAR = ['PagBank Teresópolis', 'PIX', 'PIX Teresópolis', 'TON', 'TON Teresópolis', 'VALE CREDITO']
const FORMAS_PARA_PAGBANK = ['Crédito TON', 'Débito TON']
const FORMA_VALE = 'Vale Crédito'

const { data: contas, error: eC } = await s.from('contas').select('id, nome, tipo, ativa, loja_id')
if (eC) throw new Error(eC.message)
const { data: formas, error: eF } = await s.from('formas_pagamento').select('id, nome, conta_destino_id')
if (eF) throw new Error(eF.message)
const porNome = new Map(contas.map((c) => [c.nome, c]))
const pagbank = porNome.get('PagBank Petrópolis')

const mudancas = []
for (const [de, para] of Object.entries(RENOMEAR)) {
  const c = porNome.get(de)
  if (c) mudancas.push({ tabela: 'contas', id: c.id, antes: { nome: de }, depois: { nome: para } })
}
for (const nome of ARQUIVAR) {
  const c = porNome.get(nome)
  if (!c) continue
  const novoNome = c.nome.startsWith('ARQUIVADA') ? c.nome : 'ARQUIVADA — ' + c.nome
  mudancas.push({ tabela: 'contas', id: c.id, antes: { nome: c.nome, ativa: c.ativa }, depois: { nome: novoNome, ativa: false } })
}
if (!pagbank) throw new Error('Conta PagBank Petrópolis não encontrada — abortando.')
for (const nome of FORMAS_PARA_PAGBANK) {
  const f = formas.find((x) => x.nome === nome)
  if (f) mudancas.push({ tabela: 'formas_pagamento', id: f.id, antes: { conta_destino_id: f.conta_destino_id }, depois: { conta_destino_id: pagbank.id } })
}
const vale = formas.find((x) => x.nome === FORMA_VALE)
if (vale) mudancas.push({ tabela: 'formas_pagamento', id: vale.id, antes: { conta_destino_id: vale.conta_destino_id }, depois: { conta_destino_id: null } })
const { data: rota } = await s.from('forma_conta_loja').select('forma_id, loja_id, conta_id')
for (const r of rota ?? []) mudancas.push({ tabela: 'forma_conta_loja', antes: r, depois: null })

console.log(`Mudanças a aplicar: ${mudancas.length}`)
for (const m of mudancas) console.log('  ' + m.tabela.padEnd(16) + JSON.stringify(m.antes) + ' → ' + JSON.stringify(m.depois))
if (soVer) process.exit(0)

const agora = new Date().toISOString()
const dir = path.join('docs', 'registros-banco', agora.slice(0, 7))
fs.mkdirSync(dir, { recursive: true })
const carimbo = Date.now()
const backup = path.join(dir, `contas-${carimbo}.json`)
fs.writeFileSync(backup, JSON.stringify({ quando: agora, contas, formas, rota: rota ?? [], mudancas }, null, 2), 'utf8')

for (const m of mudancas) {
  if (m.tabela === 'contas') {
    const { error } = await s.from('contas').update(m.depois).eq('id', m.id)
    if (error) { console.error('FALHOU conta ' + m.id + ': ' + error.message); process.exit(1) }
  } else if (m.tabela === 'formas_pagamento') {
    const { error } = await s.from('formas_pagamento').update(m.depois).eq('id', m.id)
    if (error) { console.error('FALHOU forma ' + m.id + ': ' + error.message); process.exit(1) }
  } else if (m.tabela === 'forma_conta_loja') {
    const { error } = await s.from('forma_conta_loja').delete().eq('forma_id', m.antes.forma_id).eq('loja_id', m.antes.loja_id)
    if (error) { console.error('FALHOU rota: ' + error.message); process.exit(1) }
  }
}

const desfazer = path.join(dir, `DESFAZER-contas-${carimbo}.sql`)
const sql = []
for (const m of mudancas) {
  if (m.tabela === 'contas') {
    const set = Object.entries({ nome: m.antes.nome, ativa: m.antes.ativa }).filter(([, v]) => v !== undefined).map(([k, v]) => `${k} = ${v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`}`).join(', ')
    sql.push(`update public.contas set ${set} where id = '${m.id}';`)
  } else if (m.tabela === 'formas_pagamento') {
    const v = m.antes.conta_destino_id === null ? 'null' : `'${m.antes.conta_destino_id}'`
    sql.push(`update public.formas_pagamento set conta_destino_id = ${v} where id = '${m.id}';`)
  } else if (m.tabela === 'forma_conta_loja') {
    sql.push(`insert into public.forma_conta_loja (forma_id, loja_id, conta_id) values ('${m.antes.forma_id}', '${m.antes.loja_id}', '${m.antes.conta_id}');`)
  }
}
fs.writeFileSync(desfazer, `-- Desfaz ${agora} (backup: ${path.basename(backup)})\n\n${sql.join('\n')}\n`, 'utf8')

console.log(`\nOK: ${mudancas.length} mudança(s) aplicada(s).`)
console.log('Backup: ' + backup)
console.log('Desfazer: ' + desfazer)
