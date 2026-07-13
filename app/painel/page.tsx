import { createServiceClient, permissoesUsuarioAtual, fetchAll } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'
import { formatBRL, formatDate } from '@/lib/utils'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { MetaWidget, type MetaInput } from '@/components/MetaWidget'
import { FluxoDiario, StatusPedidos } from '@/components/GraficosVendas'
import { IconCart, IconPackage, IconUsers, IconWallet } from '@/components/icons'
import type { ReactNode } from 'react'

export default async function DashboardPage() {
  const supabase = await createServiceClient()
  const { permissoes, isMaster } = await permissoesUsuarioAtual()
  const pode = (k: string) => temPermissao(permissoes, k, isMaster)

  // ---- Quem é / qual cargo → dashboard adaptativo ----
  const userId = (await headers()).get('x-user-id')
  // O cargo vem JUNTO do perfil (join) — antes eram 2 idas ao banco em fila.
  const { data: meuPerfil } = userId
    ? await supabase.from('perfis').select('nome, cargo, cargo_id, meta_venda_mensal, pdv_loja_id, cargos(nome)').eq('id', userId).maybeSingle()
    : { data: null }
  const cargoDoVinculo = (meuPerfil as { cargos?: { nome: string } | null } | null)?.cargos?.nome
  const cargoNome = (cargoDoVinculo ?? meuPerfil?.cargo ?? '').toLowerCase()
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
  const inicioMes = (() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })()

  const [
    { count: totalProdutos },
    { count: totalClientes },
    { data: resumo },
    { data: vendasHoje },
    { data: pendReceber },
    { data: pendPagar },
    { data: lancRecentes },
    { data: metasAtivas },
    { data: lojasList },
    { data: minhasVendasMes },
  ] = await Promise.all([
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('tipo', 'cliente'),
    // Antes isto eram 3 fetchAll: TODO o historico de 30d + TODAS as linhas de estoque
    // + TODOS os produtos ativos — ~18.700 linhas, paginadas de 1000 em 1000 (~19 idas
    // ao banco) so pra calcular ~10 numeros. Custava 2,7s.
    // Agora o Postgres soma tudo e devolve pronto em 1 chamada (~120ms).
    // Conferido campo a campo contra o calculo antigo antes de trocar: bate 100%.
    supabase.rpc('dashboard_resumo', { p_de30: de30 }),
    supabase.from('vendas').select('total').eq('status', 'concluida').gte('created_at', hoje),
    supabase.from('lancamentos').select('valor, valor_pago').eq('tipo', 'receber').eq('status', 'pendente'),
    supabase.from('lancamentos').select('valor, valor_pago').eq('tipo', 'pagar').eq('status', 'pendente'),
    supabase.from('lancamentos').select('id, descricao, valor, tipo, status, data_vencimento, pessoa_nome').order('data_vencimento', { ascending: false }).limit(5),
    // metas / lojas / minhas-vendas nao dependem de nada acima — antes rodavam
    // uma DEPOIS da outra, cada ida ao Supabase custando ~350ms de latencia.
    supabase.from('metas')
      .select('id, loja_id, rotulo, data_inicio, data_fim, dias_uteis, pessoas')
      .eq('ativo', true).lte('data_inicio', hoje).gte('data_fim', hoje),
    supabase.from('lojas').select('id, nome'),
    role === 'vendedora' && userId
      ? supabase.from('vendas').select('total, created_at, numero').eq('vendedor_id', userId).eq('status', 'concluida').gte('created_at', inicioMes).order('created_at', { ascending: false })
      : Promise.resolve({ data: null }),
  ])

  // ---- Tudo isto vem SOMADO do banco agora (dashboard_resumo) ----
  type ResumoDash = {
    n_vendas: number; faturamento: number
    unidades: number; pecas_com_estoque: number; valor_estoque: number; abaixo_min: number
    top_clientes: [string, number][]; top_vendedores: [string, number][]; lojas: [string, number][]
    lista_repor: { nome: string; saldo: number; min: number }[]
    fluxo_diario: { dia: string; valor: number; n: number }[]
    fluxo_total: number
    status_pedidos: { faturados: number; cancelados: number; aprovados: number; abertos: number }
  }
  const R = (resumo ?? {}) as Partial<ResumoDash>

  // ---- Operação recente (histórico, últimos 30 dias) ----
  const nVendas = Number(R.n_vendas) || 0
  const faturamento = Number(R.faturamento) || 0
  const ticket = nVendas ? faturamento / nVendas : 0
  const topClientes = (R.top_clientes ?? []).map(([k, v]) => [k, Number(v)] as [string, number])
  const topVendedores = (R.top_vendedores ?? []).map(([k, v]) => [k, Number(v)] as [string, number])
  const lojas = (R.lojas ?? []).map(([k, v]) => [k, Number(v)] as [string, number])
  const totalLojas = lojas.reduce((s, [, v]) => s + v, 0) || 1
  const maxCli = topClientes[0]?.[1] ?? 1
  const maxVend = topVendedores[0]?.[1] ?? 1

  // ---- Gráficos (SIGE + TecnoCell somados; vêm no mesmo RPC, sem custo extra) ----
  const fluxoDiario = (R.fluxo_diario ?? []).map((d) => ({ dia: d.dia, valor: Number(d.valor) || 0, n: Number(d.n) || 0 }))
  const fluxoTotal = Number(R.fluxo_total) || 0
  const statusPedidos = R.status_pedidos ?? { faturados: 0, cancelados: 0, aprovados: 0, abertos: 0 }
  const mesLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })

  // ---- Estoque ----
  const unidades = Number(R.unidades) || 0
  const valorEstoque = Number(R.valor_estoque) || 0
  const abaixoMin = Number(R.abaixo_min) || 0
  const pecasComEstoque = Number(R.pecas_com_estoque) || 0

  // ---- Financeiro ----
  const somaPend = (l?: { valor: number | null; valor_pago: number | null }[] | null) =>
    (l ?? []).reduce((s, x) => s + ((x.valor ?? 0) - (x.valor_pago ?? 0)), 0)
  const aReceber = somaPend(pendReceber)
  const aPagar = somaPend(pendPagar)
  const vendasHojeTotal = (vendasHoje ?? []).reduce((s, v) => s + (v.total ?? 0), 0)

  // ---- Dados da VENDEDORA (minhas vendas do mês) — já veio no lote paralelo ----
  const minhasMes = (minhasVendasMes ?? []) as { total: number; created_at: string; numero: number | null }[]
  const meuFatMes = minhasMes.reduce((s, v) => s + (v.total ?? 0), 0)
  const meuHoje = minhasMes.filter((v) => (v.created_at ?? '').split('T')[0] === hoje).reduce((s, v) => s + (v.total ?? 0), 0)
  const meuNVendasHoje = minhasMes.filter((v) => (v.created_at ?? '').split('T')[0] === hoje).length
  const meuNVendas = minhasMes.length
  const meuTicket = meuNVendas ? meuFatMes / meuNVendas : 0

  // ---- Dados do ESTOQUISTA (lista pra repor) ----
  // Já vem pronta do RPC (top 12 pelo menor saldo-mínimo) — antes era mais uma query.
  const listaRepor: { nome: string; saldo: number; min: number }[] =
    role === 'estoquista' ? (R.lista_repor ?? []) : []

  // ---- METAS ativas (já vieram no lote paralelo) ----
  const metaIds = (metasAtivas ?? []).map((m) => m.id)
  const nomeLoja: Record<string, string> = Object.fromEntries((lojasList ?? []).map((l) => [l.id, l.nome]))
  // Cash-in REAL: soma de pagamentos_venda (dinheiro/PIX/cartão), EXCLUINDO fiado.
  // Fiado é dívida a receber — não conta como "entrou no caixa" (pedido do Vitor).
  const metaMin = (metasAtivas ?? []).reduce((a, m) => (m.data_inicio < a ? m.data_inicio : a), '9999-12-31')
  const metaMax = (metasAtivas ?? []).reduce((a, m) => (m.data_fim > a ? m.data_fim : a), '0000-01-01')
  // faixas e vendas-do-periodo dependem das metas, mas NAO uma da outra: em paralelo.
  // fetchAll: pagina p/ não bater no cap de 1000 do PostgREST quando o volume crescer
  const [{ data: faixasAll }, vendasPeriodo] = await Promise.all([
    metaIds.length
      ? supabase.from('metas_faixas').select('meta_id, nome, valor, premio, ordem').in('meta_id', metaIds).order('ordem')
      : Promise.resolve({ data: [] as { meta_id: string; nome: string; valor: number; premio: number; ordem: number }[] }),
    metaIds.length
      ? fetchAll<{ id: string; caixa_id: string | null; deposito_id: string | null; created_at: string }>(
          (from, to) => supabase.from('vendas').select('id, caixa_id, deposito_id, created_at').eq('status', 'concluida').gte('created_at', metaMin).lte('created_at', metaMax + 'T23:59:59').range(from, to))
      : Promise.resolve([] as { id: string; caixa_id: string | null; deposito_id: string | null; created_at: string }[]),
  ])
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
    return { loja: nome, rotulo: m.rotulo, diasUteis: m.dias_uteis, diasDecorridos: diasCorridos, faturamento: fat, faturamentoHoje: fatHoje, pessoas: (m as { pessoas?: number }).pessoas ?? 4, faixas }
  }
  const metasWidgets = (metasAtivas ?? []).map(construirMeta).filter((m) => m.faixas.length > 0)
  const minhaLojaId = (meuPerfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id
  const minhaMetaNome = minhaLojaId ? nomeLoja[minhaLojaId] : null
  // só mostra "a meta dela" quando sabemos a loja (pdv_loja_id). Senão, mostra
  // todas (não chuta Petrópolis pra quem pode ser de Teresópolis).
  const minhaMeta = (minhaMetaNome && metasWidgets.find((m) => m.loja === minhaMetaNome)) || null

  const cor = (i: number) => (i === 0 ? 'bg-white' : i === 1 ? 'bg-white/55' : 'bg-white/30')

  const Stat = ({ icon, bg, label, value, sub, href, cls = '' }: { icon: ReactNode; bg: string; label: string; value: string; sub?: string; href: string; cls?: string }) => (
    <Link href={href} className={`group flex flex-col justify-center rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-[#1B6CA8]/40 hover:shadow-md ${cls}`}>
      <div className="flex items-center gap-3.5">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${bg}`}>{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-gray-400">{label}</p>
          <p className="truncate text-xl font-bold tabular-nums leading-tight text-gray-900">{value}</p>
          {sub && <p className="truncate text-[11px] text-gray-400">{sub}</p>}
        </div>
      </div>
    </Link>
  )

  const Rank = ({ titulo, dados, max, cls = '' }: { titulo: string; dados: [string, number][]; max: number; cls?: string }) => (
    <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${cls}`}>
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
    // Meta efetiva: a pessoal (meta_venda_mensal) se houver; senão deriva da
    // próxima faixa da loja ÷ pessoas (a "sua parte" que já aparece no widget).
    const derivada = (() => {
      if (meta > 0 || !minhaMeta) return 0
      const fs = [...minhaMeta.faixas].sort((a, b) => a.valor - b.valor)
      const prox = fs.find((f) => f.valor > minhaMeta.faturamento) ?? fs[fs.length - 1]
      const pes = minhaMeta.pessoas ?? 1
      return prox && pes > 0 ? prox.valor / pes : 0
    })()
    const metaEfetiva = meta > 0 ? meta : derivada
    const metaEfetivaPct = metaEfetiva > 0 ? Math.min(100, Math.round((meuFatMes / metaEfetiva) * 100)) : 0
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
            {metaEfetiva > 0 ? (
              <div className="relative mt-6">
                <div className="flex items-center justify-between text-xs text-white/80">
                  <span>{meta > 0 ? 'Meta do mês' : `Sua parte da meta (÷${minhaMeta?.pessoas ?? 1})`} · {formatBRL(metaEfetiva)}</span>
                  <span className="font-bold text-white tabular-nums">{metaEfetivaPct}%</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-white transition-all" style={{ width: `${metaEfetivaPct}%` }} />
                </div>
                <p className="relative mt-1.5 text-[11px] text-white/60">
                  {metaEfetivaPct >= 100 ? '🏆 bateu a meta!' : `faltam ${formatBRL(metaEfetiva - meuFatMes)}`}
                </p>
              </div>
            ) : (
              <p className="relative mt-6 inline-flex rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white/80">🎯 Sem meta definida — peça pro gerente configurar</p>
            )}
          </div>

          <Stat icon={<IconCart className="h-5 w-5 text-emerald-600" />} bg="bg-emerald-50" label="Vendas hoje" value={formatBRL(meuHoje)} sub={`${meuNVendasHoje} venda(s)`} href="/painel/pdv" />
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

      {/* ═══ BENTO GRID ═══
          Um grid unico de 12 colunas, cada card ocupando o espaço que o seu peso
          merece — em vez da pilha de faixas horizontais de largura cheia. O que
          importa (faturamento) domina; o resto acomoda em volta. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">

        {/* HERO — faturamento: o numero que manda. Ocupa 2 linhas. */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-[#1B6CA8] p-6 text-white shadow-sm md:col-span-6 lg:col-span-8 lg:row-span-2">
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
            <div className="relative mt-6 lg:mt-0">
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
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:col-span-3 lg:col-span-4">
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

        {/* Vendas de hoje — encosta no hero, fechando a coluna da direita */}
        {pode('vendas') && <Stat cls="md:col-span-3 lg:col-span-4" icon={<IconCart className="h-5 w-5 text-emerald-600" />} bg="bg-emerald-50" label="Vendas hoje (PDV)" value={formatBRL(vendasHojeTotal)} sub={`${(vendasHoje ?? []).length} venda(s)`} href="/painel/pdv" />}

        {/* Trio de contadores */}
        {pode('produtos') && <Stat cls="md:col-span-3 lg:col-span-4" icon={<IconPackage className="h-5 w-5 text-[#1B6CA8]" />} bg="bg-[#1B6CA8]/10" label="Produtos ativos" value={(totalProdutos ?? 0).toLocaleString('pt-BR')} href="/painel/produtos" />}
        {pode('clientes') && <Stat cls="md:col-span-3 lg:col-span-4" icon={<IconUsers className="h-5 w-5 text-violet-600" />} bg="bg-violet-50" label="Clientes" value={(totalClientes ?? 0).toLocaleString('pt-BR')} href="/painel/clientes" />}
        {pode('financeiro') && <Stat cls="md:col-span-3 lg:col-span-4" icon={<IconWallet className="h-5 w-5 text-amber-600" />} bg="bg-amber-50" label="A receber · a pagar" value={formatBRL(aReceber)} sub={`a pagar ${formatBRL(aPagar)}`} href="/painel/financeiro" />}

        {/* Graficos: o fluxo e largo (a linha precisa de espaco), a rosca e compacta */}
        {fluxoDiario.length > 0 && (
          <>
            <div className="md:col-span-6 lg:col-span-8"><FluxoDiario dias={fluxoDiario} total={fluxoTotal} mes={mesLabel} /></div>
            <div className="md:col-span-6 lg:col-span-4"><StatusPedidos status={statusPedidos} mes={mesLabel} /></div>
          </>
        )}

        {/* METAS — uma por loja, meio a meio */}
        {metasWidgets.map((m, i) => (
          <div key={i} className={metasWidgets.length > 1 ? 'md:col-span-6 lg:col-span-6' : 'md:col-span-6 lg:col-span-12'}>
            <MetaWidget meta={m} />
          </div>
        ))}

        {/* PRÊMIOS a pagar — comissão automática por faixa (só quem gerencia metas) */}
        {pode('metas') && metasWidgets.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:col-span-6 lg:col-span-6">
          <h3 className="text-sm font-semibold text-gray-800">🎁 Prêmios a pagar <span className="font-normal text-gray-400">· pelo faturamento atual</span></h3>
          <div className="mt-3 space-y-2">
            {metasWidgets.map((m, i) => {
              const fs = [...m.faixas].sort((a, b) => a.valor - b.valor)
              const idx = fs.reduce((acc, f, j) => (m.faturamento >= f.valor ? j : acc), -1)
              const atingida = idx >= 0 ? fs[idx] : null
              const prox = fs[idx + 1] ?? null
              const pes = m.pessoas ?? 1
              return (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{m.loja}</p>
                    <p className="text-xs text-gray-500">
                      {atingida ? <>faixa <b className="text-gray-700">{atingida.nome}</b> batida</> : <span className="text-gray-400">nenhuma faixa batida ainda</span>}
                      {prox && <> · faltam {formatBRL(prox.valor - m.faturamento)} pra {prox.nome}</>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-extrabold tabular-nums ${atingida ? 'text-emerald-600' : 'text-gray-300'}`}>{formatBRL(atingida?.premio ?? 0)}</p>
                    {atingida && pes > 1 && <p className="text-[11px] text-gray-500">👤 {formatBRL(atingida.premio / pes)} por pessoa (÷{pes})</p>}
                  </div>
                </div>
              )
              })}
            </div>
          </div>
        )}

        {/* Rankings — lado a lado */}
        <Rank cls="md:col-span-6 lg:col-span-6" titulo="Top clientes" dados={topClientes} max={maxCli} />
        <Rank cls="md:col-span-6 lg:col-span-6" titulo="Vendedores" dados={topVendedores} max={maxVend} />

        {/* últimos lançamentos */}
        {pode('financeiro') && (lancRecentes ?? []).length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm md:col-span-6 lg:col-span-6">
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

        {/* ATALHOS — fecham o bento */}
        {pode('pdv') && <Link href="/painel/pdv" className="flex items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-emerald-400 hover:text-emerald-600 md:col-span-2 lg:col-span-4"><span className="text-xl">🛒</span> Abrir PDV</Link>}
        {pode('financeiro') && <Link href="/painel/financeiro/novo" className="flex items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-[#1B6CA8] hover:text-[#1B6CA8] md:col-span-2 lg:col-span-4"><span className="text-xl">💰</span> Novo lançamento</Link>}
        <Link href="/painel/relatorios" className="flex items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-[#1B6CA8] hover:text-[#1B6CA8] md:col-span-2 lg:col-span-4"><span className="text-xl">📊</span> Relatórios</Link>

      </div>
    </div>
  )
}
