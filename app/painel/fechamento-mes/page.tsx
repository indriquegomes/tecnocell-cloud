import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { FecharMesButton } from './FecharMesButton'

// Nome do mês em pt-BR ("2026-09" → "setembro/2026").
function nomeMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${nomes[m - 1]}/${ano}`
}

// Normaliza nome pra casar "MARIA EDUADA" (Pix) com "Maria Eduarda" (cadastro).
const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

export default async function FechamentoMesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const params = await searchParams
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const pedido = params.mes ?? hoje.slice(0, 7)
  const mes = /^\d{4}-\d{2}$/.test(pedido) ? pedido : hoje.slice(0, 7)
  const [ano, m] = mes.split('-').map(Number)
  const inicio = mes + '-01'
  const proxMes = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
  const mesAnterior = m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`
  const mesSeguinte = proxMes.slice(0, 7)

  const supabase = await createServiceClient()

  // ---- Tabelas auxiliares (loja de cada depósito / caixa / pessoa) ----
  const [{ data: lojas }, deps, cxs, perfis] = await Promise.all([
    supabase.from('lojas').select('id, nome').order('nome'),
    fetchAll<any>((from, to) => supabase.from('depositos').select('id, loja_id').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('caixas').select('id, loja_id').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('perfis').select('id, nome, lojas_permitidas').range(from, to)),
  ])
  const lojasList = (lojas ?? []) as { id: string; nome: string }[]
  const petropolisId = lojasList.find((l) => l.nome === 'Petrópolis')?.id ?? null
  const lojaDeDeposito = new Map((deps ?? []).map((d) => [d.id, d.loja_id as string | null]))
  const lojaDeCaixa = new Map((cxs ?? []).map((c) => [c.id, c.loja_id as string | null]))
  // pessoa → lojas (uma pessoa pode ser de 1 ou 2 lojas)
  const perfisPorNome = new Map<string, string[]>()
  for (const p of (perfis ?? [])) {
    if (!p.nome) continue
    const ls = (p.lojas_permitidas ?? []).filter(Boolean) as string[]
    perfisPorNome.set(norm(p.nome), ls)
  }
  const lojaDePessoa = (nome: string): string | null => {
    const n = norm(nome)
    // match exato; senão, acha perfil cujo nome CONTÉM a primeira palavra do pix (mais folgado)
    let ls = perfisPorNome.get(n)
    if (!ls) {
      const chave = n.split(' ').slice(0, 2).join(' ')
      for (const [pnome, l] of perfisPorNome) {
        if (pnome.includes(chave)) { ls = l; break }
      }
    }
    if (!ls || ls.length === 0) return null
    return ls.length === 1 ? ls[0] : null // "ambas" = null (não dá pra cravar uma loja só)
  }

  // ---- ENTRADAS: pagamentos na hora (pago) + fiado cobrado (recebimentos) ----
  const pags = await fetchAll<any>((from, to) => supabase.from('pagamentos_venda')
    .select('valor, vendas!inner(deposito_id, numero, status, uso_interno, data)')
    .eq('status', 'pago').eq('vendas.status', 'concluida').eq('vendas.uso_interno', false)
    .lt('vendas.numero', 100000).gte('vendas.data', inicio).lt('vendas.data', proxMes).range(from, to))

  const recs = await fetchAll<any>((from, to) => supabase.from('movimentos_caixa')
    .select('valor, caixa_id').eq('tipo', 'recebimento')
    .gte('created_at', inicio).lt('created_at', proxMes).range(from, to))

  // ---- COMPRAS: itens de nota de entrada (o que cada loja RECEBEU) ----
  const comprasItens = await fetchAll<any>((from, to) => supabase.from('itens_nota_entrada')
    .select('total_item, deposito_id, notas_entrada!inner(data_entrada)')
    .gte('notas_entrada.data_entrada', inicio).lt('notas_entrada.data_entrada', proxMes).range(from, to))

  // ---- DESPESAS: contas pagas, EXCETO compra de peça (que já entra via nota) ----
  const despesas = await fetchAll<any>((from, to) => supabase.from('lancamentos')
    .select('valor, loja_id, categoria, pessoa_nome').eq('tipo', 'pagar').eq('status', 'pago')
    .gte('data_vencimento', inicio).lt('data_vencimento', proxMes).range(from, to))

  // ---- agrega por loja ----
  const bucket = (id: string) => ({
    loja: id,
    nome: lojasList.find((l) => l.id === id)?.nome ?? id,
    entradas: 0, fiadoCobrado: 0, compras: 0, despesas: 0,
  })
  const porLoja: Record<string, ReturnType<typeof bucket>> = {}
  for (const l of lojasList) porLoja[l.id] = bucket(l.id)

  const add = (id: string | null, campo: 'entradas' | 'fiadoCobrado' | 'compras' | 'despesas', valor: number) => {
    if (!id || !porLoja[id]) return
    porLoja[id][campo] += valor
  }

  for (const p of pags) add(lojaDeDeposito.get(p.vendas?.deposito_id) ?? null, 'entradas', p.valor ?? 0)
  for (const r of recs) add(lojaDeCaixa.get(r.caixa_id) ?? null, 'fiadoCobrado', r.valor ?? 0)
  for (const c of comprasItens) add(lojaDeDeposito.get(c.deposito_id) ?? null, 'compras', c.total_item ?? 0)

  const CAT_COMPRAS = ['Fornecedor / Mercadoria', 'Fornecedor ZL', 'fonecedor']
  for (const d of despesas) {
    const cat = (d.categoria || '').trim()
    if (CAT_COMPRAS.includes(cat)) continue // compra de peça — já conta via nota de entrada
    // loja_id primeiro; senão cruza pela pessoa (salário/motoboy); senão cai em Petrópolis (setembro provisório)
    const loja = d.loja_id || lojaDePessoa(d.pessoa_nome || '') || petropolisId
    add(loja, 'despesas', d.valor ?? 0)
  }

  const linhas = lojasList.map((l) => {
    const b = porLoja[l.id]
    const entradas = b.entradas + b.fiadoCobrado
    const saidas = b.compras + b.despesas
    return { ...b, entradas, saidas, resultado: entradas - saidas }
  })

  // Já fechado?
  const { data: fechado } = await supabase.from('configuracoes').select('valor').eq('chave', `fechamento_mes:${mes}`).maybeSingle()
  const fechamento = fechado ? (fechado.valor as { fechado_em: string }) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📅 Fechamento do Mês</h2>
          <p className="mt-0.5 text-sm text-gray-500">Entradas e saídas de cada loja — o que entrou, o que saiu e o resultado.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/painel/fechamento-mes?mes=${mesAnterior}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">← Anterior</a>
          <span className="rounded-lg bg-blue-50 px-4 py-1.5 text-sm font-bold text-blue-700">{nomeMes(mes)}</span>
          <a href={`/painel/fechamento-mes?mes=${mesSeguinte}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Próximo →</a>
        </div>
      </div>

      {fechamento && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          ✅ Mês fechado em {new Date(fechamento.fechado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        </div>
      )}

      {linhas.map((b) => (
        <div key={b.loja} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900">{b.nome}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase text-emerald-700">Entrou no mês</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">{formatBRL(b.entradas)}</p>
              <p className="text-[11px] text-emerald-600">vendas pagas + fiado cobrado</p>
            </div>
            <div className="rounded-xl bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase text-red-700">Saiu no mês</p>
              <p className="mt-1 text-xl font-bold text-red-700">{formatBRL(b.saidas)}</p>
              <p className="text-[11px] text-red-600">compras {formatBRL(b.compras)} + despesas {formatBRL(b.despesas)}</p>
            </div>
            <div className={`rounded-xl p-4 ${b.resultado >= 0 ? 'bg-blue-50' : 'bg-amber-50'}`}>
              <p className="text-xs font-semibold uppercase text-gray-500">Resultado</p>
              <p className={`mt-1 text-xl font-bold ${b.resultado >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>{formatBRL(b.resultado)}</p>
              <p className="text-[11px] text-gray-500">entrou − saiu</p>
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <FecharMesButton mes={mes} fechado={!!fechamento} />
        <p className="text-xs text-gray-400">O botão só marca o mês como conferido — não trava nem apaga nada.</p>
      </div>
    </div>
  )
}
