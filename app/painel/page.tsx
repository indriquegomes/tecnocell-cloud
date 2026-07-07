import { createServiceClient, permissoesUsuarioAtual, fetchAll } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'
import { formatBRL, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

export default async function DashboardPage() {
  const supabase = await createServiceClient()
  const { permissoes, isMaster } = await permissoesUsuarioAtual()
  const pode = (k: string) => temPermissao(permissoes, k, isMaster)

  const hoje = new Date().toISOString().split('T')[0]
  const de30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const [
    { count: totalProdutos },
    { count: totalClientes },
    histRecente,
    estoqueItems,
    produtosInfo,
    { data: vendasHoje },
    { data: pendReceber },
    { data: pendPagar },
    { data: lancRecentes },
  ] = await Promise.all([
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('tipo', 'cliente'),
    fetchAll<{ valor_final: number | null; cliente: string | null; vendedor: string | null; loja: string | null }>(
      (f, t) => supabase.from('historico_vendas').select('valor_final, cliente, vendedor, loja').gte('data', de30).range(f, t)),
    fetchAll<{ produto_id: string; quantidade: number }>(
      (f, t) => supabase.from('estoque').select('produto_id, quantidade').gt('quantidade', 0).range(f, t)),
    fetchAll<{ id: string; preco_custo: number | null; estoque_minimo: number | null }>(
      (f, t) => supabase.from('produtos').select('id, preco_custo, estoque_minimo').eq('ativo', true).range(f, t)),
    supabase.from('vendas').select('total').eq('status', 'concluida').gte('created_at', hoje),
    supabase.from('lancamentos').select('valor, valor_pago').eq('tipo', 'receber').eq('status', 'pendente'),
    supabase.from('lancamentos').select('valor, valor_pago').eq('tipo', 'pagar').eq('status', 'pendente'),
    supabase.from('lancamentos').select('id, descricao, valor, tipo, status, data_vencimento, pessoa_nome').order('data_vencimento', { ascending: false }).limit(5),
  ])

  // ---- Operação recente (histórico, últimos 30 dias) ----
  const nVendas = histRecente.length
  const faturamento = histRecente.reduce((s, v) => s + (v.valor_final ?? 0), 0)
  const ticket = nVendas ? faturamento / nVendas : 0
  const porCliente: Record<string, number> = {}
  const porVendedor: Record<string, number> = {}
  const porLoja: Record<string, number> = {}
  for (const v of histRecente) {
    const c = (v.cliente ?? '').trim()
    if (c && !/consumidor|não identif|nao identif/i.test(c)) porCliente[c] = (porCliente[c] ?? 0) + (v.valor_final ?? 0)
    const vd = (v.vendedor ?? '').trim()
    if (vd) porVendedor[vd] = (porVendedor[vd] ?? 0) + (v.valor_final ?? 0)
    const lj = (v.loja ?? '').replace(/TECNOCELL /i, '').trim()
    if (lj) porLoja[lj] = (porLoja[lj] ?? 0) + (v.valor_final ?? 0)
  }
  const top = (o: Record<string, number>, n: number) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n)
  const topClientes = top(porCliente, 6)
  const topVendedores = top(porVendedor, 5)
  const lojas = top(porLoja, 3)
  const totalLojas = lojas.reduce((s, [, v]) => s + v, 0) || 1
  const maxCli = topClientes[0]?.[1] ?? 1
  const maxVend = topVendedores[0]?.[1] ?? 1

  // ---- Estoque ----
  const info = new Map(produtosInfo.map((p) => [p.id, p]))
  const totalPorProduto: Record<string, number> = {}
  let valorEstoque = 0, unidades = 0
  for (const e of estoqueItems) {
    totalPorProduto[e.produto_id] = (totalPorProduto[e.produto_id] ?? 0) + e.quantidade
    unidades += e.quantidade
    const c = info.get(e.produto_id)
    if (c) valorEstoque += e.quantidade * (c.preco_custo ?? 0)
  }
  let abaixoMin = 0
  for (const p of produtosInfo) {
    const min = p.estoque_minimo ?? 0
    if (min > 0 && (totalPorProduto[p.id] ?? 0) < min) abaixoMin++
  }
  const pecasComEstoque = Object.keys(totalPorProduto).length

  // ---- Financeiro ----
  const somaPend = (l?: { valor: number | null; valor_pago: number | null }[] | null) =>
    (l ?? []).reduce((s, x) => s + ((x.valor ?? 0) - (x.valor_pago ?? 0)), 0)
  const aReceber = somaPend(pendReceber)
  const aPagar = somaPend(pendPagar)
  const vendasHojeTotal = (vendasHoje ?? []).reduce((s, v) => s + (v.total ?? 0), 0)

  const cor = (i: number) => (i === 0 ? 'bg-white' : i === 1 ? 'bg-white/55' : 'bg-white/30')

  const Stat = ({ icon, bg, label, value, sub, href }: { icon: string; bg: string; label: string; value: string; sub?: string; href: string }) => (
    <Link href={href} className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-[#1B6CA8]/40 hover:shadow-md">
      <div className="flex items-center gap-3.5">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl ${bg}`}>{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-gray-400">{label}</p>
          <p className="truncate text-xl font-bold tabular-nums leading-tight text-gray-900">{value}</p>
          {sub && <p className="truncate text-[11px] text-gray-400">{sub}</p>}
        </div>
      </div>
    </Link>
  )

  const Rank = ({ titulo, dados, max }: { titulo: string; dados: [string, number][]; max: number }) => (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3.5"><h3 className="text-sm font-semibold text-gray-800">{titulo} <span className="font-normal text-gray-400">· 30 dias</span></h3></div>
      <div className="p-2">
        {dados.length === 0 ? <p className="px-3 py-8 text-center text-sm text-gray-400">Sem dados no período.</p> :
          dados.map(([nome, val], i) => (
            <div key={nome} className="relative flex items-center justify-between overflow-hidden rounded-lg px-3 py-2.5">
              <div className="absolute inset-y-1 left-0 rounded-lg bg-[#1B6CA8]/[0.08]" style={{ width: `${8 + 92 * (val / max)}%` }} />
              <div className="relative z-10 flex min-w-0 items-center gap-3">
                <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-[#1B6CA8]/50">{i + 1}</span>
                <span className="truncate text-sm text-gray-700">{nome}</span>
              </div>
              <span className="relative z-10 shrink-0 pl-3 text-sm font-semibold tabular-nums text-gray-900">{formatBRL(val)}</span>
            </div>
          ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <Dica texto="Visão geral: operação dos últimos 30 dias (do histórico), estoque, financeiro e o que está vendendo agora." />
      </div>

      {/* HERO: faturamento + estoque */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-[#1B6CA8] p-6 text-white shadow-sm lg:col-span-2">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Faturamento · últimos 30 dias</p>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium">histórico</span>
          </div>
          <p className="relative mt-2.5 text-[38px] font-extrabold leading-none tracking-tight tabular-nums">{formatBRL(faturamento)}</p>
          <div className="relative mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/75">
            <span><b className="font-bold text-white tabular-nums">{nVendas.toLocaleString('pt-BR')}</b> vendas</span>
            <span>ticket <b className="font-bold text-white">{formatBRL(ticket)}</b></span>
            <span><b className="font-bold text-white">~{Math.round(nVendas / 30)}</b> por dia</span>
          </div>
          {lojas.length > 0 && (
            <div className="relative mt-6">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-white/15">
                {lojas.map(([nome, val], i) => (
                  <div key={nome} style={{ width: `${Math.max(4, (100 * val) / totalLojas)}%` }} className={cor(i)} title={nome} />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75">
                {lojas.map(([nome, val], i) => (
                  <span key={nome} className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${cor(i)}`} />{nome} · <b className="font-semibold text-white">{formatBRL(val)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {pode('estoque') && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Valor em estoque</p>
            <p className="mt-2.5 text-3xl font-extrabold leading-none tabular-nums text-[#1B6CA8]">{formatBRL(valorEstoque)}</p>
            <p className="mt-1.5 text-xs text-gray-400">a preço de custo</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-100 pt-3.5 text-sm text-gray-500">
              <span><b className="font-bold tabular-nums text-gray-800">{unidades.toLocaleString('pt-BR')}</b> unidades</span>
              <span><b className="font-bold tabular-nums text-gray-800">{pecasComEstoque.toLocaleString('pt-BR')}</b> peças</span>
            </div>
            {abaixoMin > 0
              ? <Link href="/painel/estoque" className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition">⚠️ {abaixoMin} peças abaixo do mínimo</Link>
              : <p className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">✓ estoque em dia</p>}
          </div>
        )}
      </div>

      {/* AGORA */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pode('vendas') && <Stat icon="🛒" bg="bg-emerald-50" label="Vendas hoje (PDV)" value={formatBRL(vendasHojeTotal)} sub={`${(vendasHoje ?? []).length} venda(s)`} href="/painel/pdv" />}
        {pode('produtos') && <Stat icon="📦" bg="bg-[#1B6CA8]/10" label="Produtos ativos" value={(totalProdutos ?? 0).toLocaleString('pt-BR')} href="/painel/produtos" />}
        {pode('clientes') && <Stat icon="👥" bg="bg-violet-50" label="Clientes" value={(totalClientes ?? 0).toLocaleString('pt-BR')} href="/painel/clientes" />}
        {pode('financeiro') && <Stat icon="💰" bg="bg-amber-50" label="A receber · a pagar" value={formatBRL(aReceber)} sub={`a pagar ${formatBRL(aPagar)}`} href="/painel/financeiro" />}
      </div>

      {/* TOP clientes + vendedores */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Rank titulo="Top clientes" dados={topClientes} max={maxCli} />
        <Rank titulo="Vendedores" dados={topVendedores} max={maxVend} />
      </div>

      {/* últimos lançamentos */}
      {pode('financeiro') && (lancRecentes ?? []).length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-gray-800">Últimos lançamentos</h3>
            <Link href="/painel/financeiro" className="text-xs text-[#1B6CA8] hover:underline">Ver todos</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {lancRecentes!.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-5 py-3">
                <div><p className="text-sm font-medium text-gray-800">{l.descricao || 'Sem descrição'}</p>{l.pessoa_nome && <p className="text-xs text-gray-400">{l.pessoa_nome}</p>}</div>
                <div className="text-right">
                  <p className={`text-sm font-bold tabular-nums ${l.tipo === 'receber' ? 'text-emerald-600' : 'text-rose-600'}`}>{l.tipo === 'receber' ? '+' : '-'}{formatBRL(l.valor ?? 0)}</p>
                  <p className="text-xs text-gray-400">{l.data_vencimento ? formatDate(l.data_vencimento) : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ATALHOS */}
      <div className="grid gap-3 sm:grid-cols-3">
        {pode('pdv') && <Link href="/painel/pdv" className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-emerald-400 hover:text-emerald-600"><span className="text-xl">🛒</span> Abrir PDV</Link>}
        {pode('financeiro') && <Link href="/painel/financeiro/novo" className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-[#1B6CA8] hover:text-[#1B6CA8]"><span className="text-xl">💰</span> Novo lançamento</Link>}
        <Link href="/painel/relatorios" className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-[#1B6CA8] hover:text-[#1B6CA8]"><span className="text-xl">📊</span> Relatórios</Link>
      </div>
    </div>
  )
}
