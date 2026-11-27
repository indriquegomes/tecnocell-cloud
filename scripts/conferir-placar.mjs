// PLACAR — "o que já está resolvido" não volta como pendência sem virar RECAÍDA.
//
// Lê `docs/registros/<ano-mês>/PLACAR.md`, roda a checagem de cada item no banco e imprime
// SÓ o que precisa de atenção:
//
//   ABERTO           → é a lista de verdade do que falta
//   RECAÍDA          → estava fechado e voltou a aparecer (com a data do fato)
//   JÁ NÃO APARECE   → estava aberto e a checagem não acha mais problema (pode fechar o item)
//   FECHADO ✔        → resumo em uma linha (não vira lista)
//   SEM CHECAGEM     → item só documental (decisão/dono), não é pendência
//
// Uso: node scripts/conferir-placar.mjs            (mês corrente + out/nov se houver)
//      node scripts/conferir-placar.mjs 2026-11
//      node scripts/conferir-placar.mjs --autoteste (testa a lógica, sem banco)
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BR = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── leitura do PLACAR ────────────────────────────────────────────────────────
function lerPlacar(arquivo) {
  const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)
  const itens = []
  for (const l of linhas) {
    if (!l.startsWith('|')) continue
    const cols = l.split('|').map((c) => c.trim())
    if (cols.length < 7) continue
    const id = cols[1].replace(/`/g, '')
    if (!id || id === 'id' || /^-+$/.test(id)) continue
    itens.push({ id, item: cols[2], tipo: cols[3], situacao: cols[4], prova: cols[5], obs: cols[6] })
  }
  return itens
}

// ── checagens (uma por id do PLACAR) ─────────────────────────────────────────
// Cada checagem devolve { problema: number, valor?: number, ultimo?: string }
// problema = 0 quando o item está como deveria.
function checagens(s, mes) {
  const inicio = `${mes}-01T00:00:00-03:00`
  const fim = mesFim(mes)
  const conta = async (montar) => {
    const { count, error } = await montar()
    if (error) throw new Error(error.message)
    return count ?? 0
  }
  return {
    'porteiro-categoria': async () => {
      // categoria inventada tem que ser RECUSADA pelo trigger do banco
      const r = await s.from('lancamentos').insert({
        descricao: '__QA__ checagem do placar', valor: 1, tipo: 'pagar', status: 'pendente',
        categoria: 'FONE QUE VITÃO PEGOU NA LOJA', data_vencimento: '2026-11-27',
      }).select('id')
      if (!r.error) {
        // passou quando não devia: limpa e acusa
        for (const row of r.data ?? []) await s.from('lancamentos').delete().eq('id', row.id)
        return { problema: 1 }
      }
      return { problema: 0 }
    },
    'porteiro-origem': async () => {
      const { data } = await s.from('formas_pagamento').select('nome, ativo').eq('nome', 'Outros')
      const ativa = (data ?? []).some((f) => f.ativo)
      return { problema: ativa ? 1 : 0 }
    },
    'permissao-lancar': async () => {
      // `.filter('permissoes','cs',…)` com count/head volta null no PostgREST — ler e contar aqui.
      const [{ data: perfis }, { data: cargos }] = await Promise.all([
        s.from('perfis').select('permissoes'),
        s.from('cargos').select('permissoes'),
      ])
      const tem = (rows) => (rows ?? []).filter((r) => Array.isArray(r.permissoes) && r.permissoes.includes('financeiro_lancar')).length
      const n = tem(perfis) + tem(cargos)
      return { problema: n > 0 ? 0 : 1, valor: n }
    },
    'devolucao-fora-do-app': async () => {
      const n = await conta(() => s.from('devolucoes').select('id', { count: 'exact', head: true }).eq('tipo_credito', 'fora_do_app'))
      return { problema: n > 0 ? 0 : 1, valor: n }
    },
    'cancelar-vale-sem-dinheiro': async () => {
      const n = await conta(() => s.from('creditos_clientes').select('id', { count: 'exact', head: true })
        .ilike('descricao', '%sem devolução de dinheiro%'))
      return { problema: n > 0 ? 0 : 1, valor: n }
    },
    'estornos-pendentes': async () => {
      // RECAÍDA CLÁSSICA: o caminho antigo (vale -> estorno) volta a abrir conta pendente
      const { data } = await s.from('lancamentos').select('id, created_at')
        .eq('tipo', 'pagar').eq('status', 'pendente').ilike('descricao', '%Estorno de cr%')
        .order('created_at', { ascending: false }).limit(20)
      const n = (data ?? []).length
      return { problema: n, valor: n, ultimo: data?.[0]?.created_at ?? null }
    },
    'estornos-cruzamento': async () => {
      const n = await conta(() => s.from('pix_saidas').select('id', { count: 'exact', head: true }))
      return { problema: n >= 16 ? 0 : 1, valor: n }
    },
    'devolucoes-fecham-centavo': async () => {
      // peça devolvida = abatido de fiado + reembolso (por devolução) — mesma identidade do doc
      const devs = await tudo(s, (a, b) => s.from('devolucoes')
        .select('id, valor_total, abate_fiado, reembolsos').gte('created_at', inicio).lt('created_at', fim)
        .order('id').range(a, b))
      let fora = 0, ultimo = null
      for (const d of devs) {
        const total = Number(d.valor_total ?? 0)
        const abate = Number(d.abate_fiado ?? 0)
        const reemb = (Array.isArray(d.reembolsos) ? d.reembolsos : []).reduce((t, r) => t + Number(r?.valor ?? 0), 0)
        if (Math.abs(total - (abate + reemb)) > 0.05) { fora++; if (!ultimo) ultimo = d.id }
      }
      return { problema: fora, valor: fora, ultimo }
    },
    'contas-organizadas': async () => {
      const { data } = await s.from('contas').select('nome, ativa')
      const ativas = (data ?? []).filter((c) => c.ativa)
      const sobraAtiva = ativas.filter((c) => /^(PIX|TON|VALE CREDITO|PagBank Teresópolis)/i.test(c.nome ?? ''))
      return { problema: sobraAtiva.length, valor: ativas.length }
    },
    'conta-unica-pix': async () => {
      const { data } = await s.from('formas_pagamento').select('nome, conta_destino_id').eq('tipo', 'pix')
      if (!data?.length) return { problema: 0, valor: 0 }
      const { data: contas } = await s.from('contas').select('id, nome').in('id', data.map((f) => f.conta_destino_id).filter(Boolean))
      const nomes = (contas ?? []).map((c) => c.nome)
      const ok = nomes.length === 1 && /PagBank/i.test(nomes[0] ?? '')
      return { problema: ok ? 0 : 1, valor: nomes.length }
    },
    'fone-vitao': async () => {
      const { data } = await s.from('lancamentos').select('id, status, tipo')
        .ilike('descricao', '%FONE QUE VITÃO PEGOU NA LOJA%')
      const aindaPago = (data ?? []).some((l) => l.status === 'pago' && l.tipo === 'pagar')
      return { problema: aindaPago ? 1 : 0 }
    },
    'linhas-sem-forma': async () => {
      const rows = await tudo(s, (a, b) => s.from('lancamentos')
        .select('id, valor, categoria, forma_pagamento, data_pagamento')
        .eq('tipo', 'pagar').eq('status', 'pago').is('conta_id', null)
        .gte('data_pagamento', inicio).order('id').range(a, b))
      const alvo = rows.filter((l) => !((l.forma_pagamento ?? '').trim())
        && ['salários', 'mercadoria', 'fornecedor / mercadoria', 'fornecedor/mercadoria'].includes((l.categoria ?? '').toLowerCase()))
      return { problema: alvo.length, valor: alvo.reduce((t, l) => t + Number(l.valor ?? 0), 0) }
    },
    'saldo-inicial-pagbank': async () => {
      const { data } = await s.from('contas').select('nome, saldo_inicial, ativa').ilike('nome', 'PagBank%').eq('ativa', true)
      const zerada = (data ?? []).some((c) => Number(c.saldo_inicial ?? 0) === 0)
      return { problema: zerada ? 1 : 0, valor: (data ?? []).reduce((t, c) => t + Number(c.saldo_inicial ?? 0), 0) }
    },
    'extrato-fornecedor': async () => 'documental',     // documento do dono — não há checagem
    'contas-particulares': async () => 'documental',    // ação do dono
    'fechamento-novembro': async () => 'documental',    // ação do dono
    'regra-teste': async () => null,            // decisão do dono
  }
}

function mesFim(mes) {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01-01T00:00:00-03:00` : `${a}-${String(m + 1).padStart(2, '0')}-01T00:00:00-03:00`
}

async function tudo(s, q) {
  const out = []
  const vistos = new Set()
  for (let i = 0; i < 60; i++) {
    const { data, error } = await q(i * 1000, i * 1000 + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const d of data) { if (!vistos.has(d.id)) { vistos.add(d.id); out.push(d) } }
    if (data.length < 1000) break
  }
  return out
}

// ── veredito (puro — é o que o autoteste exercita) ───────────────────────────
export function veredito(item, resultado) {
  if (item.tipo === 'decisao') return 'SEM CHECAGEM'
  if (!resultado) return 'SEM CHECAGEM'
  const problema = Number(resultado.problema ?? 0)
  if (item.situacao === 'fechado') return problema > 0 ? 'RECAÍDA' : 'FECHADO'
  return problema > 0 ? 'ABERTO' : 'JÁ NÃO APARECE'
}

// ── autoteste: prova a lógica sem tocar no banco ─────────────────────────────
function autoteste() {
  const casos = [
    [{ tipo: 'fechado', situacao: 'fechado' }, { problema: 0 }, 'FECHADO'],
    [{ tipo: 'fechado', situacao: 'fechado' }, { problema: 3, ultimo: '2026-11-27T10:00:00Z' }, 'RECAÍDA'],
    [{ tipo: 'aberto', situacao: 'aberto' }, { problema: 9, valor: 11057.12 }, 'ABERTO'],
    [{ tipo: 'aberto', situacao: 'aberto' }, { problema: 0 }, 'JÁ NÃO APARECE'],
    [{ tipo: 'decisao', situacao: 'decidido' }, { problema: 0 }, 'SEM CHECAGEM'],
    [{ tipo: 'aberto', situacao: 'aberto' }, null, 'SEM CHECAGEM'],
  ]
  let falhas = 0
  for (const [item, r, esperado] of casos) {
    const obtido = veredito(item, r)
    const ok = obtido === esperado
    if (!ok) falhas++
    console.log(`  ${ok ? 'ok  ' : 'FALHOU'} ${item.tipo}/${item.situacao} + ${JSON.stringify(r)} → ${obtido} (esperado ${esperado})`)
  }
  // e a leitura da tabela: o PLACAR real tem que ser lido sem perder linha
  const itens = lerPlacar(path.join('docs', 'registros', '2026-11', 'PLACAR.md'))
  const semId = itens.filter((i) => !i.id)
  console.log(`  ${itens.length >= 15 ? 'ok  ' : 'FALHOU'} leu ${itens.length} itens do PLACAR (esperado ≥15)`)
  if (itens.length < 15) falhas++
  if (semId.length) { console.log('  FALHOU linha sem id: ' + semId.length); falhas++ }
  console.log(falhas === 0 ? '\nAUTOTESTE OK' : `\nAUTOTESTE FALHOU (${falhas})`)
  process.exit(falhas === 0 ? 0 : 1)
}

// ── execução ─────────────────────────────────────────────────────────────────
if (process.argv.includes('--autoteste')) autoteste()

const mes = process.argv[2] && /^\d{4}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : novoMes()
function novoMes() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
}

const arquivo = path.join('docs', 'registros', mes, 'PLACAR.md')
if (!fs.existsSync(arquivo)) { console.error('PLACAR não encontrado: ' + arquivo); process.exit(1) }

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const itens = lerPlacar(arquivo)
const reg = checagens(s, mes)
const grupos = { ABERTO: [], RECAÍDA: [], 'JÁ NÃO APARECE': [], FECHADO: [], 'SEM CHECAGEM': [] }

for (const item of itens) {
  const fn = reg[item.id]
  let resultado = null
  if (fn) {
    try { resultado = await fn() } catch (e) { resultado = { problema: 1, erro: e.message } }
  }
  if (resultado === 'documental') resultado = null
  grupos[veredito(item, resultado)].push({ item, resultado })
}

const linha = (n, r) => {
  const valor = r?.valor != null ? ` · R$ ${BR(r.valor)}` : ''
  const quando = r?.ultimo ? ` · último ${String(r.ultimo).slice(0, 16).replace('T', ' ')}` : ''
  const erro = r?.erro ? ` · ERRO: ${r.erro}` : ''
  return `  ${n}${valor}${quando}${erro}`
}

console.log(`\nPLACAR ${mes} — ${itens.length} itens\n`)
for (const g of ['RECAÍDA', 'ABERTO']) {
  if (!grupos[g].length) { console.log(`${g}: nada\n`); continue }
  console.log(`${g}:`)
  for (const { item, resultado } of grupos[g]) console.log(linha(item.item, resultado))
  console.log('')
}
if (grupos['JÁ NÃO APARECE'].length) {
  console.log('JÁ NÃO APARECE (pode marcar como fechado no PLACAR):')
  for (const { item, resultado } of grupos['JÁ NÃO APARECE']) console.log(linha(item.item, resultado))
  console.log('')
}
console.log(`FECHADO ✔: ${grupos['FECHADO'].length}${grupos['FECHADO'].length ? ' — ' + grupos['FECHADO'].map((g) => g.item.id).join(', ') : ''}`)
if (grupos['SEM CHECAGEM'].length) console.log(`SEM CHECAGEM (documental/decisão): ${grupos['SEM CHECAGEM'].map((g) => g.item.id).join(', ')}`)
