import { createServiceClient, permissoesUsuarioAtual, fetchAll } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'
import { formatBRL, formatDate } from '@/lib/utils'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { MetaWidget, type MetaInput } from '@/components/MetaWidget'

export default async function DashboardPage() {
  const supabase = await createServiceClient()
  const { permissoes, isMaster } = await permissoesUsuarioAtual()
  const pode = (k: string) => temPermissao(permissoes, k, isMaster)

  // ---- Quem é / qual cargo → dashboard adaptativo ----
  const userId = (await headers()).get('x-user-id')
  const { data: meuPerfil } = userId
    ? await supabase.from('perfis').select('nome, cargo, cargo_id, meta_venda_mensal, pdv_loja_id').eq('id', userId).maybeSingle()
    : { data: null }
  let cargoNome = (meuPerfil?.cargo ?? '').toLowerCase()
  const cgId = (meuPerfil as { cargo_id?: string | null } | null)?.cargo_id
  if (cgId) {
    const { data: cg } = await supabase.from('cargos').select('nome').eq('id', cgId).maybeSingle()
    if (cg?.nome) cargoNome = cg.nome.toLowerCase()
  }
  const primeiroNome = (meuPerfil?.nome ?? '').trim().split(/\s+/)[0] || ''
  const meta = Number((meuPerfil as { meta_venda_mensal?: number } | null)?.meta_venda_mensal ?? 0)
  // classifica: cargo pelo nome; fallback por permissão
  const role: 'dono' | 'gerente' | 'estoquista' | 'vendedora' =
    isMaster ? 'dono'
    : /gerente|gestor|admin|dono|dono/.test(cargoNome) ? 'gerente'
    : /estoqu/.test(cargoNome) ? 'estoquista'
    : /vend/.test(cargoNome) ? 'vendedora'
    : pode('relatorios') || pode('financeiro') ? 'gerente'
    : pode('estoque') && !pode('pdv') ? 'estoquista'
    : pode('pdv') ? 'vendedora'
    : 'gerente'

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
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
  const abaixoIds: string[] = []
  for (const p of produtosInfo) {
    const min = p.estoque_minimo ?? 0
    if (min > 0 && (totalPorProduto[p.id] ?? 0) < min) { abaixoMin++; abaixoIds.push(p.id) }
  }
  const pecasComEstoque = Object.keys(totalPorProduto).length

  // ---- Financeiro ----
  const somaPend = (l?: { valor: number | null; valor_pago: number | null }[] | null) =>
    (l ?? []).reduce((s, x) => s + ((x.valor ?? 0) - (x.valor_pago ?? 0)), 0)
  const aReceber = somaPend(pendReceber)
  const aPagar = somaPend(pendPagar)
  const vendasHojeTotal = (vendasHoje ?? []).reduce((s, v) => s + (v.total ?? 0), 0)

  // ---- Dados da VENDEDORA (minhas vendas do mês) ----
  const inicioMes = (() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })()
  const { data: minhasVendasMes } = role === 'vendedora' && userId
    ? await supabase.from('vendas').select('total, created_at, numero').eq('vendedor_id', userId).eq('status', 'concluida').gte('created_at', inicioMes).order('created_at', { ascending: false })
    : { data: null }
  const minhasMes = minhasVendasMes ?? []
  const meuFatMes = minhasMes.reduce((s, v) => s + (v.total ?? 0), 0)
  const meuHoje = minhasMes.filter((v) => (v.created_at ?? '').split('T')[0] === hoje).reduce((s, v) => s + (v.total ?? 0), 0)
  const meuNVendasHoje = minhasMes.filter((v) => (v.created_at ?? '').split('T')[0] === hoje).length
  const meuNVendas = minhasMes.length
  const meuTicket = meuNVendas ? meuFatMes / meuNVendas : 0
  const metaPct = meta > 0 ? Math.min(100, Math.round((meuFatMes / meta) * 100)) : 0

  // ---- Dados do ESTOQUISTA (lista pra repor) ----
  let listaRepor: { nome: string; saldo: number; min: number }[] = []
  if (role === 'estoquista' && abaixoIds.length > 0) {
    const { data: nomes } = await supabase.from('produtos').select('id, nome, estoque_minimo').in('id', abaixoIds.slice(0, 200))
    listaRepor = (nomes ?? [])
      .map((n) => ({ nome: n.nome as string, saldo: totalPorProduto[n.id] ?? 0, min: (n.estoque_minimo as number) ?? 0 }))
      .sort((a, b) => (a.saldo - a.min) - (b.saldo - b.min))
      .slice(0, 12)
  }

  // ---- METAS ativas (do banco), por loja ----
  const { data: metasAtivas } = await supabase.from('metas')
    .select('id, loja_id, rotulo, data_inicio, data_fim, dias_uteis')
    .eq('ativo', true).lte('data_inicio', hoje).gte('data_fim', hoje)
  const metaIds = (metasAtivas ?? []).map((m) => m.id)
  const { data: faixasAll } = metaIds.length
    ? await supabase.from('metas_faixas').select('meta_id, nome, valor, premio, ordem').in('meta_id', metaIds).order('ordem')
    : { data: [] as { meta_id: string; nome: string; valor: number; premio: number; ordem: number }[] }
  const { data: lojasList } = await supabase.from('lojas').select('id, nome')
  const nomeLoja: Record<string, string> = Object.fromEntries((lojasList ?? []).map((l) => [l.id, l.nome]))
  // Cash-in REAL: soma de pagamentos_venda (dinheiro/PIX/cartão), EXCLUINDO fiado.
  // Fiado é dívida a receber — não conta como "entrou no caixa" (pedido do Vitor).
  const metaMin = (metasAtivas ?? []).reduce((a, m) => (m.data_inicio < a ? m.data_inicio : a), '9999-12-31')
  const metaMax = (metasAtivas ?? []).reduce((a, m) => (m.data_fim > a ? m.data_fim : a), '0000-01-01')
  // fetchAll: pagina p/ não bater no cap de 1000 do PostgREST quando o volume crescer
  const vendasPeriodo = metaIds.length
    ? await fetchAll<{ id: string; caixa_id: string | null; deposito_id: string | null; created_at: string }>(
        (from, to) => supabase.from('vendas').select('id, caixa_id, deposito_id, created_at').eq('status', 'concluida').gte('created_at', metaMin).lte('created_at', metaMax + 'T23:59:59').range(from, to))
    : []
  const vendaIds = vendasPeriodo.map((v) => v.id)
  const [pagsV, { data: formasFiado }, { data: caixasL }, { data: depsL }] = await Promise.all([
    vendaIds.length ? fetchAll<{ venda_id: string; valor: number; forma_pagamento_id: string }>(
      (from, to) => supabase.from('pagamentos_venda').select('venda_id, valor, forma_pagamento_id').in('venda_id', vendaIds).range(from, to)) : Promise.resolve([] as { venda_id: string; valor: number; forma_pagamento_id: string }[]),
    supabase.from('formas_pagamento').select('id').eq('tipo', 'fiado'),
    supabase.from('caixas').select('id, loja_id'),
    supabase.from('depositos').select('id, loja_id'),
  ])
  const fiadoIds = new Set((formasFiado ?? []).map((f) => f.id))
  const caixaLoja: Record<string, string | null> = Object.fromEntries((caixasL ?? []).map((c) => [c.id, c.loja_id]))
  const depLoja: Record<string, string | null> = Object.fromEntries((depsL ?? []).map((d) => [d.id, d.loja_id]))
  const cashPorVenda: Record<string, number> = {}
  for (const p of pagsV ?? []) if (!fiadoIds.has(p.forma_pagamento_id)) cashPorVenda[p.venda_id] = (cashPorVenda[p.venda_id] ?? 0) + Number(p.valor)
  const vendasCash = (vendasPeriodo ?? []).map((v) => ({
    lojaId: caixaLoja[v.caixa_id ?? ''] ?? depLoja[v.deposito_id ?? ''] ?? null,
    dia: (v.created_at ?? '').slice(0, 10),
    cash: cashPorVenda[v.id] ?? 0,
  }))

  // conta dias TRABALHADOS (segunda a sábado, pula domingo) entre duas datas
  const diasTrabalhados = (a: string, b: string) => {
    const ini = new Date(a + 'T00:00:00'), fim = new Date(b + 'T00:00:00')
    let n = 0
    for (const d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n++
    return n
  }
  const construirMeta = (m: NonNullable<typeof metasAtivas>[number]): MetaInput => {
    const nome = nomeLoja[m.loja_id ?? ''] ?? 'Loja'
    const doPeriodo = vendasCash.filter((v) => v.lojaId === m.loja_id && v.dia >= m.data_inicio && v.dia <= m.data_fim)
    const fat = doPeriodo.reduce((s, v) => s + v.cash, 0)
    const fatHoje = doPeriodo.filter((v) => v.dia === hoje).reduce((s, v) => s + v.cash, 0)
    const faixas = (faixasAll ?? []).filter((f) => f.meta_id === m.id).map((f) => ({ nome: f.nome, valor: Number(f.valor), premio: Number(f.premio) }))
    // dias trabalhados (seg–sáb) já decorridos, do início até hoje (sem passar do fim), limitado ao total
    const ateHoje = hoje < m.data_fim ? hoje : m.data_fim
    const diasCorridos = Math.max(1, Math.min(m.dias_uteis, diasTrabalhados(m.data_inicio, ateHoje)))
    return { loja: nome, rotulo: m.rotulo, diasUteis: m.dias_uteis, diasDecorridos: diasCorridos, faturamento: fat, faturamentoHoje: fatHoje, faixas }
  }
  const metasWidgets = (metasAtivas ?? []).map(construirMeta).filter((m) => m.faixas.length > 0)
  const minhaLojaId = (meuPerfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id
  const minhaMetaNome = minhaLojaId ? nomeLoja[minhaLojaId] : null
  // só mostra "a meta dela" quando sabemos a loja (pdv_loja_id). Senão, mostra
  // todas (não chuta Petrópolis pra quem pode ser de Teresópolis).
  const minhaMeta = (minhaMetaNome && metasWidgets.find((m) => m.loja === minhaMetaNome)) || null

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

  // ============ VENDEDORA ============
  if (role === 'vendedora') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Olá, {primeiroNome || 'vendedora'} 👋</h2>
          <p className="mt-0.5 text-sm text-gray-400">Seu resumo de vendas — bora vender!</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="relative overflow-hidden rounded-2xl bg-[#1B6CA8] p-6 text-white shadow-sm lg:col-span-2">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
            <p className="relative text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Minhas vendas · este mês</p>
            <p className="relative mt-2.5 text-[38px] font-extrabold leading-none tabular-nums">{formatBRL(meuFatMes)}</p>
            <div className="relative mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/75">
              <span><b className="font-bold text-white tabular-nums">{meuNVendas}</b> vendas</span>
              <span>ticket <b className="font-bold text-white">{formatBRL(meuTicket)}</b></span>
            </div>
            {meta > 0 ? (
              <div className="relative mt-6">
                <div className="flex items-center justify-between text-xs text-white/80">
                  <span>Meta do mês · {formatBRL(meta)}</span>
                  <span className="font-bold text-white tabular-nums">{metaPct}%</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-white transition-all" style={{ width: `${metaPct}%` }} />
                </div>
              </div>
            ) : (
              <p className="relative mt-6 inline-flex rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white/80">🎯 Sem meta definida — peça pro gerente configurar</p>
            )}
          </div>

          <Stat icon="🛒" bg="bg-emerald-50" label="Vendas hoje" value={formatBRL(meuHoje)} sub={`${meuNVendasHoje} venda(s)`} href="/painel/pdv" />
        </div>

        {/* Meta da loja — o time todo mira as faixas (sabendo a loja: só a dela; senão, todas) */}
        {minhaMeta ? <MetaWidget meta={minhaMeta} /> : metasWidgets.map((m, i) => <MetaWidget key={i} meta={m} />)}

        <Link href="/painel/pdv" className="flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 p-5 text-lg font-bold text-white shadow-sm shadow-emerald-600/25 transition hover:from-emerald-700 hover:to-emerald-600">
          🛒 Abrir o PDV
        </Link>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3.5"><h3 className="text-sm font-semibold text-gray-800">Minhas últimas vendas <span className="font-normal text-gray-400">· este mês</span></h3></div>
          <div className="divide-y divide-gray-50">
            {minhasMes.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">Nenhuma venda sua neste mês ainda. Bora! 💪</p>
            ) : minhasMes.slice(0, 6).map((v, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-gray-400">#{v.numero ?? '—'}</span>
                  <span className="text-sm text-gray-500">{v.created_at ? formatDate(v.created_at) : ''}</span>
                </div>
                <span className="text-sm font-bold tabular-nums text-gray-900">{formatBRL(v.total ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ============ ESTOQUISTA ============
  if (role === 'estoquista') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Olá, {primeiroNome || 'estoquista'} 👋</h2>
          <p className="mt-0.5 text-sm text-gray-400">Saúde do estoque num relance.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="relative overflow-hidden rounded-2xl bg-[#1B6CA8] p-6 text-white shadow-sm lg:col-span-2">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
            <p className="relative text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Valor em estoque · custo</p>
            <p className="relative mt-2.5 text-[38px] font-extrabold leading-none tabular-nums">{formatBRL(valorEstoque)}</p>
            <div className="relative mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/75">
              <span><b className="font-bold text-white tabular-nums">{unidades.toLocaleString('pt-BR')}</b> unidades</span>
              <span><b className="font-bold text-white tabular-nums">{pecasComEstoque.toLocaleString('pt-BR')}</b> peças</span>
            </div>
          </div>
          <div className={`rounded-2xl border p-6 shadow-sm ${abaixoMin > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Reposição</p>
            <p className={`mt-2.5 text-4xl font-extrabold tabular-nums ${abaixoMin > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{abaixoMin}</p>
            <p className="mt-1 text-xs text-gray-500">{abaixoMin > 0 ? 'peças abaixo do mínimo' : 'tudo em dia ✓'}</p>
            <Link href="/painel/estoque" className="mt-4 inline-flex rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition">Ver estoque →</Link>
          </div>
        </div>

        {listaRepor.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3.5"><h3 className="text-sm font-semibold text-gray-800">Repor com prioridade</h3></div>
            <div className="divide-y divide-gray-50">
              {listaRepor.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <span className="truncate pr-3 text-sm text-gray-700">{p.nome}</span>
                  <span className="shrink-0 text-xs"><b className={`tabular-nums ${p.saldo <= 0 ? 'text-rose-600' : 'text-amber-600'}`}>{p.saldo}</b> <span className="text-gray-400">/ mín {p.min}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/painel/estoque" className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-[#1B6CA8] hover:text-[#1B6CA8]"><span className="text-xl">📦</span> Estoque</Link>
          <Link href="/painel/estoque/movimentar" className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-[#1B6CA8] hover:text-[#1B6CA8]"><span className="text-xl">🔄</span> Movimentar</Link>
          <Link href="/painel/compras" className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-[#1B6CA8] hover:text-[#1B6CA8]"><span className="text-xl">📥</span> Notas de Entrada</Link>
        </div>
      </div>
    )
  }

  // ============ GERENTE / DONO (visão completa) ============
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

      {/* METAS das lojas */}
      {metasWidgets.length > 0 && (
        <div className={`grid gap-4 ${metasWidgets.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {metasWidgets.map((m, i) => <MetaWidget key={i} meta={m} />)}
        </div>
      )}

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
