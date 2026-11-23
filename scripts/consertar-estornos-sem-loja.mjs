// CONSERTA os estornos de crédito que foram gravados FORA da tela (SQL/script) em 22–23/11:
// eles ficaram sem `loja_id` e sem `estorna_credito_id`.
//
// Por que isso é grave: o saldo de vale é lido POR LOJA (é o que o PDV usa para limitar o
// vale na venda). O estorno sem loja cai num balde "(sem loja)": o crédito continua
// aparecendo inteiro na loja dele e o estorno aparece noutro lugar. Resultado prático —
// RODRIGO PEREIRA, LUIZ CARLOS SANTANA e DENILSON PEÇAS mostraram no PDV o crédito CHEIO
// (1.025,50 · 67,00 · 45,00) quando o saldo real é 25,50 · 0 · 0.
//
// O caminho certo é a RPC `estornar_credito_cliente` (usada pela tela): ela é atômica,
// liga o estorno ao crédito pelo `estorna_credito_id` (índice único), copia a loja do
// crédito e recusa estorno que deixaria o saldo negativo. Estes três passaram por fora.
//
// O estorno de 1.000,00 do RODRIGO cancelou DOIS créditos (750,00 + 250,00 de 16/11) numa
// linha só — o índice único é por crédito, então ele é dividido em dois estornos ligados.
//
// DRY por padrão. Grava só com `--gravar`, com backup JSON + DESFAZER.sql.
// Uso: node scripts/consertar-estornos-sem-loja.mjs [--gravar]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GRAVAR = process.argv.includes('--gravar')
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = (x) => (x ?? '').slice(0, 16).replace('T', ' ')

const { data: lojas } = await s.from('lojas').select('id, nome')
const nomeLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]))

// Estornos sem loja E sem vínculo — os que vieram de fora da tela.
const { data: orfaos, error } = await s.from('creditos_clientes')
  .select('id, pessoa_id, pessoa_nome, tipo, valor, loja_id, descricao, estorna_credito_id, created_at, devolucao_id')
  .eq('tipo', 'estorno').is('loja_id', null).is('estorna_credito_id', null).order('created_at')
if (error) throw new Error(error.message)
console.log(`estornos sem loja e sem vínculo: ${orfaos?.length ?? 0}\n`)

// Acha o crédito (ou a soma de créditos) que o estorno cancela.
// Regra: valor EXATO — primeiro um crédito só do mesmo valor (o mais recente);
// se não houver, a combinação de créditos que fecha o valor (preferindo os mais novos).
// Não adianta pegar crédito velho "livre": crédito que já foi gasto não pode ser cancelado.
function acharCredito(estorno, candidatos) {
  const alvo = Math.round(Number(estorno.valor) * 100)
  const emCentavos = candidatos
    .map((c) => ({ c, v: Math.round(Number(c.valor) * 100) }))
    .filter((x) => x.v > 0 && x.v <= alvo)
    .sort((a, b) => (b.c.created_at ?? '').localeCompare(a.c.created_at ?? '')) // mais novo primeiro
  for (const x of emCentavos) if (x.v === alvo) return [{ credito: x.c, valor: x.v / 100 }]
  // combinação: DP guarda, para cada soma, a lista de itens que chegou nela
  const dp = new Map([[0, []]])
  for (const x of emCentavos) {
    const novo = new Map()
    for (const [soma, itens] of dp) {
      const s2 = soma + x.v
      if (s2 > alvo || dp.has(s2) || novo.has(s2)) continue
      novo.set(s2, [...itens, x])
    }
    for (const [soma, itens] of novo) if (!dp.has(soma)) dp.set(soma, itens)
    if (dp.has(alvo)) break
  }
  const combo = dp.get(alvo)
  if (!combo) return []
  return combo.map((x) => ({ credito: x.c, valor: x.v / 100 }))
}

const planos = []
for (const e of orfaos ?? []) {
  // créditos da mesma pessoa criados até o estorno, que ainda não têm estorno ligado
  const { data: creditos } = await s.from('creditos_clientes')
    .select('id, valor, loja_id, created_at, descricao')
    .eq('pessoa_id', e.pessoa_id).eq('tipo', 'credito')
    .lte('created_at', e.created_at)
    .order('created_at')
  const { data: ligados } = await s.from('creditos_clientes')
    .select('estorna_credito_id').eq('pessoa_id', e.pessoa_id).eq('tipo', 'estorno').not('estorna_credito_id', 'is', null)
  const jaLigados = new Set((ligados ?? []).map((x) => x.estorna_credito_id))
  const livres = (creditos ?? []).filter((c) => !jaLigados.has(c.id))

  const escolhidos = acharCredito(e, livres)
  const somaEscolhida = escolhidos.reduce((t, x) => t + Math.round(x.valor * 100), 0)
  const falta = (Math.round(Number(e.valor) * 100) - somaEscolhida) / 100
  planos.push({ estorno: e, escolhidos, falta })
  console.log(`=== ${e.pessoa_nome} · estorno R$ ${brl(e.valor)} em ${dia(e.created_at)} (id ${e.id.slice(0, 8)}) ===`)
  console.log(`  créditos livres (não ligados) até essa data: ${livres.length}`)
  for (const x of escolhidos) console.log(`    ligar R$ ${brl(x.valor).padStart(8)} ao crédito ${x.credito.id.slice(0, 8)} de ${dia(x.credito.created_at)} em ${nomeLoja.get(x.credito.loja_id) ?? '(sem loja)'} — ${String(x.credito.descricao ?? '').slice(0, 40)}`)
  if (falta > 0) console.log(`  ⚠ sobrou R$ ${brl(falta)} sem crédito livre para ligar`)
  console.log('')
}

const semSolucao = planos.filter((p) => p.falta > 0 || p.escolhidos.length === 0)
if (semSolucao.length) {
  console.log('⚠ há estorno que não fecha com crédito livre — NÃO gravar enquanto isso.')
  if (!GRAVAR) process.exit(0)
  console.error('abortado: corrija os casos acima primeiro')
  process.exit(1)
}

if (!GRAVAR) { console.log('(DRY-RUN — nada gravado. Use --gravar.)'); process.exit(0) }

const dir = 'docs/registros-banco/2026-11'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(`${dir}/estornos-sem-loja-antes-${carimbo}.json`, JSON.stringify({ quando: new Date().toISOString(), orfaos, planos }, null, 2), 'utf8')

const desfazer = []
for (const p of planos) {
  // estorno de crédito único: conserta a própria linha
  if (p.escolhidos.length === 1 && Math.abs(p.escolhidos[0].valor - Number(p.estorno.valor)) < 0.01) {
    const alvo = p.escolhidos[0].credito
    const { error: errUp } = await s.from('creditos_clientes').update({
      loja_id: alvo.loja_id,
      estorna_credito_id: alvo.id,
    }).eq('id', p.estorno.id)
    if (errUp) { console.error('erro ao ligar', p.estorno.id, errUp.message); process.exit(1) }
    desfazer.push(`UPDATE creditos_clientes SET loja_id = NULL, estorna_credito_id = NULL WHERE id = '${p.estorno.id}';`)
    console.log(`✔ ${p.estorno.pessoa_nome}: estorno ${brl(p.estorno.valor)} ligado ao crédito ${alvo.id.slice(0, 8)} (${nomeLoja.get(alvo.loja_id)})`)
    continue
  }
  // estorno que cobre VÁRIOS créditos: vira uma linha por crédito (o índice único é por crédito)
  for (const x of p.escolhidos) {
    const { error: errIns } = await s.from('creditos_clientes').insert({
      pessoa_id: p.estorno.pessoa_id,
      pessoa_nome: p.estorno.pessoa_nome,
      loja_id: x.credito.loja_id,
      tipo: 'estorno',
      valor: x.valor,
      descricao: (p.estorno.descricao ?? 'Estorno de crédito') + ` (dividido: crédito ${x.credito.id.slice(0, 8)})`,
      estorna_credito_id: x.credito.id,
      created_at: p.estorno.created_at,
    })
    if (errIns) { console.error('erro ao inserir estorno ligado:', errIns.message); process.exit(1) }
    desfazer.push(`DELETE FROM creditos_clientes WHERE estorna_credito_id = '${x.credito.id}' AND tipo = 'estorno' AND descricao LIKE '%(dividido: crédito ${x.credito.id.slice(0, 8)})%';`)
    console.log(`✔ ${p.estorno.pessoa_nome}: parte de ${brl(x.valor)} ligada ao crédito ${x.credito.id.slice(0, 8)} (${nomeLoja.get(x.credito.loja_id)})`)
  }
  const { error: errDel } = await s.from('creditos_clientes').delete().eq('id', p.estorno.id)
  if (errDel) { console.error('erro ao remover estorno antigo:', errDel.message); process.exit(1) }
  desfazer.unshift(`INSERT INTO creditos_clientes (id, pessoa_id, pessoa_nome, loja_id, tipo, valor, descricao, created_at) VALUES ('${p.estorno.id}', '${p.estorno.pessoa_id}', '${(p.estorno.pessoa_nome ?? '').replace(/'/g, "''")}', NULL, 'estorno', ${p.estorno.valor}, '${(p.estorno.descricao ?? '').replace(/'/g, "''")}', '${p.estorno.created_at}');`)
  console.log(`✔ ${p.estorno.pessoa_nome}: estorno antigo de ${brl(p.estorno.valor)} substituído por ${p.escolhidos.length} linhas ligadas`)
}

fs.writeFileSync(`${dir}/DESFAZER-estornos-sem-loja-${carimbo}.sql`, desfazer.join('\n') + '\n', 'utf8')
console.log(`\nbackup: ${dir}/estornos-sem-loja-antes-${carimbo}.json`)
console.log(`desfazer: ${dir}/DESFAZER-estornos-sem-loja-${carimbo}.sql`)
