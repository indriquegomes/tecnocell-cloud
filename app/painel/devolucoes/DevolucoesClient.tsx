'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  buscarVendasRecentes, buscarVendaParaDevolucao, registrarDevolucao, buscarItensDevolucao,
  type VendaParaDevolucao, type VendaResumo,
} from './actions'

const supabaseBrowser = createClient()
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = (s: string) => {
  const d = new Date(s)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface ItemDevolucaoLinha {
  item_id: string
  devolucao_id: string
  venda_id: string | null
  created_at: string
  pessoa_nome: string | null
  operador: string | null
  produto_nome: string
  quantidade: number
  preco_unit: number
  total_item: number
  tipo_credito: string
  motivo: string | null
  status_produto?: string
}

// ── Constantes ────────────────────────────────────────────────────────────────
const STATUS_PRODUTO = [
  { key: 'ok',      label: 'OK',       cor: 'bg-green-50 text-green-700 border-green-200' },
  { key: 'defeito', label: 'Defeito',  cor: 'bg-red-50 text-red-700 border-red-200' },
  { key: 'troca',   label: 'Troca',    cor: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { key: 'avaria',  label: 'Avaria',   cor: 'bg-orange-50 text-orange-700 border-orange-200' },
]
const statusCor = (s?: string) =>
  STATUS_PRODUTO.find(x => x.key === (s ?? 'ok'))?.cor ?? 'bg-gray-100 text-gray-500 border-gray-200'
const statusLabel = (s?: string) =>
  STATUS_PRODUTO.find(x => x.key === (s ?? 'ok'))?.label ?? 'OK'

const CREDITO_LABEL: Record<string, string> = {
  credito_conta: 'Crédito conta', dinheiro: 'Dinheiro', pix: 'PIX',
  debito: 'Débito', credito: 'Crédito',
  cancelamento_fiado: 'Cancelou fiado', sem_reembolso: 'Sem reembolso',
}
const CREDITO_COR: Record<string, string> = {
  credito_conta: 'bg-green-50 text-green-700 border-green-200',
  dinheiro: 'bg-blue-50 text-blue-700 border-blue-200',
  pix: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  debito: 'bg-purple-50 text-purple-700 border-purple-200',
  credito: 'bg-purple-50 text-purple-700 border-purple-200',
  cancelamento_fiado: 'bg-orange-50 text-orange-700 border-orange-200',
  sem_reembolso: 'bg-gray-100 text-gray-500 border-gray-200',
}
const CREDITO_OPTS = [
  { key: 'credito_conta', label: 'Crédito na conta', icon: '🏦', destaque: true },
  { key: 'dinheiro',      label: 'Dinheiro',          icon: '💵' },
  { key: 'pix',           label: 'PIX',               icon: '💠' },
  { key: 'debito',        label: 'Débito',            icon: '💳' },
  { key: 'credito',       label: 'Crédito',           icon: '💳' },
  { key: 'sem_reembolso', label: 'Sem reembolso',     icon: '—'  },
]

type Step = 'buscar' | 'itens' | 'confirmar'

// ── Componente principal ───────────────────────────────────────────────────────
export function DevolucoesClient({
  linhas, totalItens, totalValor, nDevolucoes, filtros,
}: {
  linhas: ItemDevolucaoLinha[]
  totalItens: number
  totalValor: number
  nDevolucoes: number
  filtros: { de: string; ate: string; q: string }
}) {
  const router = useRouter()

  // ── busca/filtros ──────────────────────────────────────────────────────────
  const [busca, setBusca] = useState(filtros.q)
  const [filtroDe, setFiltroDe] = useState(filtros.de)
  const [filtroAte, setFiltroAte] = useState(filtros.ate)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  const linhasFiltradas = useMemo(() => {
    if (!busca.trim()) return linhas
    const b = busca.toLowerCase()
    return linhas.filter(l =>
      l.produto_nome.toLowerCase().includes(b) ||
      l.pessoa_nome?.toLowerCase().includes(b) ||
      l.venda_id?.toLowerCase().includes(b) ||
      l.operador?.toLowerCase().includes(b) ||
      l.motivo?.toLowerCase().includes(b)
    )
  }, [linhas, busca])

  const aplicarFiltros = () => {
    router.push(`/painel/devolucoes?${new URLSearchParams({ de: filtroDe, ate: filtroAte, q: busca })}`)
  }

  // ── modal nova devolução ───────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('buscar')
  const [buscaVenda, setBuscaVenda] = useState('')
  const [vendas, setVendas] = useState<VendaResumo[]>([])
  const [carregandoBusca, setCarregandoBusca] = useState(false)
  const [venda, setVenda] = useState<VendaParaDevolucao | null>(null)
  const [carregandoVenda, setCarregandoVenda] = useState(false)
  const [itens, setItens] = useState<Map<string, number>>(new Map())
  const [statusProduto, setStatusProduto] = useState<Map<string, string>>(new Map())
  const [motivo, setMotivo] = useState('')
  const [tipoCredito, setTipoCredito] = useState('dinheiro')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  // ── modal detalhe ──────────────────────────────────────────────────────────
  const [detalhe, setDetalhe] = useState<{
    devId: string; created_at: string; pessoa_nome: string | null
    tipo_credito: string; motivo: string | null
    itens: { nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[]
  } | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)

  const buscaRef = useRef<HTMLInputElement>(null)

  const authToken = async () => {
    const { data } = await supabaseBrowser.auth.getSession()
    return data.session?.access_token ?? ''
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { fechar(); setDetalhe(null) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open && step === 'buscar') setTimeout(() => buscaRef.current?.focus(), 50)
  }, [open, step])

  const fechar = () => {
    setOpen(false); setStep('buscar'); setBuscaVenda(''); setVendas([])
    setVenda(null); setItens(new Map()); setStatusProduto(new Map())
    setMotivo(''); setTipoCredito('dinheiro'); setErro('')
  }

  const carregarVendas = useCallback(async (q: string) => {
    setCarregandoBusca(true); setErro('')
    try {
      const t = await authToken()
      if (!t) { setErro('Sessão expirada.'); return }
      setVendas(await buscarVendasRecentes(t, q))
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao buscar vendas.') }
    finally { setCarregandoBusca(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selecionarVenda = async (id: string) => {
    setCarregandoVenda(true); setErro('')
    try {
      const t = await authToken()
      const v = await buscarVendaParaDevolucao(t, id)
      if (!v) { setErro('Venda não encontrada.'); return }
      setVenda(v)
      const m = new Map<string, number>()
      const sp = new Map<string, string>()
      v.itens.forEach((i) => { m.set(i.produto_id, i.quantidade); sp.set(i.produto_id, 'ok') })
      setItens(m); setStatusProduto(sp)
      setTipoCredito(v.lancamento_pendente ? 'cancelamento_fiado' : 'dinheiro')
      setStep('itens')
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar venda.') }
    finally { setCarregandoVenda(false) }
  }

  const totalSelecionado = venda
    ? venda.itens.reduce((s, i) => s + (itens.get(i.produto_id) ?? 0) * i.preco_unitario, 0)
    : 0

  const confirmar = async () => {
    if (!venda) return
    setSalvando(true); setErro('')
    try {
      const t = await authToken()
      const itensDev = venda.itens
        .filter((i) => (itens.get(i.produto_id) ?? 0) > 0)
        .map((i) => ({
          ...i,
          quantidade: itens.get(i.produto_id) ?? 0,
          total_item: (itens.get(i.produto_id) ?? 0) * i.preco_unitario,
          status_produto: statusProduto.get(i.produto_id) ?? 'ok',
        }))
      if (!itensDev.length) { setErro('Selecione ao menos um item.'); return }
      await registrarDevolucao(t, {
        venda_id: venda.id, deposito_id: venda.deposito_id,
        pessoa_id: venda.pessoa_id, pessoa_nome: venda.pessoa_nome,
        vendedor_nome: venda.vendedor_nome, motivo, tipo_credito: tipoCredito,
        itens: itensDev, lancamento_pendente: venda.lancamento_pendente,
      })
      fechar(); setSucesso(true)
      setTimeout(() => setSucesso(false), 4000)
      router.refresh()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao registrar devolução.') }
    finally { setSalvando(false) }
  }

  const abrirDetalhe = async (devId: string, linha: ItemDevolucaoLinha) => {
    setCarregandoDetalhe(true); setDetalhe(null)
    try {
      const t = await authToken()
      const itensDetalhados = await buscarItensDevolucao(t, devId)
      setDetalhe({
        devId, created_at: linha.created_at, pessoa_nome: linha.pessoa_nome,
        tipo_credito: linha.tipo_credito, motivo: linha.motivo,
        itens: itensDetalhados,
      })
    } finally { setCarregandoDetalhe(false) }
  }

  const nVendaLabel = (v: VendaResumo) =>
    v.numero ? `#${String(v.numero).padStart(4, '0')} · ${v.pessoa_nome ?? 'Cliente Final'}` : (v.pessoa_nome ?? 'Cliente Final')

  const ticketMedio = nDevolucoes > 0 ? totalValor / nDevolucoes : 0

  return (
    <div className="space-y-5">

      {/* Toast */}
      {sucesso && (
        <div className="fixed top-5 right-5 z-[60] rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          ✅ Devolução registrada com sucesso!
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Vendas</p>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Devoluções</h2>
        </div>
        <button onClick={() => { setOpen(true); carregarVendas('') }}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 transition shadow-sm">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Nova Devolução
        </button>
      </div>

      {/* ── Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Devoluções',    valor: String(nDevolucoes), sub: 'no período',    cor: 'text-gray-900' },
          { label: 'Itens devolvidos', valor: String(totalItens), sub: 'unidades',   cor: 'text-blue-600' },
          { label: 'Total devolvido', valor: fmt(totalValor),     sub: 'em valor',   cor: 'text-red-600' },
          { label: 'Ticket médio',   valor: fmt(ticketMedio),     sub: 'por devolução', cor: 'text-gray-600' },
        ].map(({ label, valor, sub, cor }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${cor}`}>{valor}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Barra busca + filtros ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
        <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') aplicarFiltros() }}
          placeholder="Pesquisar por produto, cliente, venda, motivo..."
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400" />
        {busca && (
          <button onClick={() => setBusca('')} className="text-gray-300 hover:text-gray-500">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <div className="h-4 w-px bg-gray-200 mx-1" />
        <button onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            mostrarFiltros ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
          }`}>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 8h10M11 12h2" />
          </svg>
          Filtros
        </button>
        <button onClick={aplicarFiltros}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition">
          Aplicar
        </button>
      </div>

      {mostrarFiltros && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <span className="text-xs font-semibold text-blue-700 uppercase">Período</span>
          <input type="date" value={filtroDe} onChange={(e) => setFiltroDe(e.target.value)}
            className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <span className="text-blue-300">—</span>
          <input type="date" value={filtroAte} onChange={(e) => setFiltroAte(e.target.value)}
            className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button onClick={aplicarFiltros}
            className="ml-auto rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition">
            Filtrar período
          </button>
        </div>
      )}

      {/* ── Tabela de itens ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">Itens devolvidos</span>
            {linhasFiltradas.length !== linhas.length
              ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{linhasFiltradas.length} de {linhas.length}</span>
              : linhas.length > 0 && <span className="text-xs text-gray-400">{linhas.length} {linhas.length === 1 ? 'item' : 'itens'}</span>
            }
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/80 text-left">
                {['Nº Venda', 'Data/Hora', 'Operador', 'Cliente', 'Produto', 'Status', 'Qtd', 'V. Unit.', 'Total', 'Crédito', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {linhasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="h-10 w-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
                      </svg>
                      <p className="text-sm text-gray-400">Nenhum item encontrado.</p>
                      {busca && <p className="text-xs text-gray-300">Limpe a busca ou ajuste o período.</p>}
                    </div>
                  </td>
                </tr>
              ) : linhasFiltradas.map((l) => (
                <tr key={l.item_id} className="hover:bg-gray-50/60 transition group">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                      {l.venda_id ? l.venda_id.slice(0, 8).toUpperCase() : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{fmtDt(l.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[100px] truncate">
                    {l.operador ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-[140px] truncate">
                    {l.pessoa_nome ?? <span className="italic text-gray-400 font-normal">Cliente Final</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[220px]">
                    <p className="truncate font-medium">{l.produto_nome}</p>
                    {l.motivo && <p className="text-xs text-gray-400 truncate mt-0.5">{l.motivo}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${statusCor(l.status_produto)}`}>
                      {statusLabel(l.status_produto)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                      {l.quantidade}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap">{fmt(l.preco_unit)}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-600 whitespace-nowrap">-{fmt(l.total_item)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                      CREDITO_COR[l.tipo_credito] ?? 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      {CREDITO_LABEL[l.tipo_credito] ?? l.tipo_credito}
                    </span>
                  </td>
                  <td className="px-3 py-3 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => abrirDetalhe(l.devolucao_id, l)}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 transition whitespace-nowrap">
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {linhasFiltradas.length > 0 && (
          <div className="border-t border-gray-50 px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-400">{linhasFiltradas.length} {linhasFiltradas.length === 1 ? 'item' : 'itens'}</p>
            <p className="text-sm font-bold text-red-600">
              -{fmt(linhasFiltradas.reduce((s, l) => s + l.total_item, 0))}
            </p>
          </div>
        )}
      </div>

      {/* ── Modal Nova Devolução ─────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={fechar}>
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">Nova Devolução</h3>
                <div className="flex items-center gap-2 mt-1.5">
                  {(['buscar', 'itens', 'confirmar'] as Step[]).map((s, i) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition ${
                        step === s ? 'bg-blue-600 text-white' :
                        (['buscar','itens','confirmar'].indexOf(step) > i) ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                      }`}>{(['buscar','itens','confirmar'].indexOf(step) > i) ? '✓' : i + 1}</div>
                      <span className={`text-xs transition ${step === s ? 'font-semibold text-blue-700' : 'text-gray-400'}`}>
                        {s === 'buscar' ? 'Buscar venda' : s === 'itens' ? 'Mercadorias' : 'Confirmar'}
                      </span>
                      {i < 2 && <span className="text-gray-200 text-xs">›</span>}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={fechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">

              {/* Step 1 — Buscar */}
              {step === 'buscar' && (
                <div className="space-y-3">
                  <input ref={buscaRef} value={buscaVenda}
                    onChange={(e) => { setBuscaVenda(e.target.value); carregarVendas(e.target.value) }}
                    placeholder="Nome do cliente ou número da venda..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
                  {carregandoBusca
                    ? <p className="py-8 text-center text-sm text-gray-400">Buscando...</p>
                    : vendas.length === 0
                      ? <p className="py-8 text-center text-sm text-gray-400">Nenhuma venda encontrada.</p>
                      : (
                        <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                          {vendas.map((v) => (
                            <button key={v.id} onClick={() => selecionarVenda(v.id)} disabled={carregandoVenda}
                              className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-blue-50 transition text-left disabled:opacity-50">
                              <div>
                                <p className="font-semibold text-gray-900">{nVendaLabel(v)}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{fmtDt(v.created_at)}</p>
                              </div>
                              <span className="font-bold text-gray-800 ml-4 shrink-0">{fmt(v.total)}</span>
                            </button>
                          ))}
                        </div>
                      )
                  }
                  {carregandoVenda && <p className="py-2 text-center text-sm text-gray-400">Carregando itens...</p>}
                </div>
              )}

              {/* Step 2 — Mercadorias */}
              {step === 'itens' && venda && (
                <div className="space-y-4">
                  {/* Info da venda original */}
                  <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900">{venda.pessoa_nome ?? 'Cliente Final'}</p>
                      {venda.numero && (
                        <span className="rounded-full bg-white border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-600">
                          #{String(venda.numero).padStart(4, '0')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmtDt(venda.created_at)} · Total {fmt(venda.total)}
                    </p>
                    {/* Pagamento original — como o SIGE mostra */}
                    {venda.forma_pagamento_nome && (
                      <p className="mt-2 text-xs">
                        <span className="text-gray-500">Pago com </span>
                        <span className="font-semibold text-gray-700">{venda.forma_pagamento_nome}</span>
                      </p>
                    )}
                    {venda.lancamento_pendente && (
                      <p className="mt-2 text-xs font-semibold text-orange-600 bg-orange-50 rounded-lg px-2 py-1">
                        ⚠️ Fiado não pago — devolução cancela o débito, sem reembolso em dinheiro
                      </p>
                    )}
                  </div>

                  {/* Tabela de mercadorias (estilo SIGE) */}
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr className="text-xs font-semibold uppercase text-gray-400">
                          <th className="px-3 py-2 text-left">Produto</th>
                          <th className="px-3 py-2 text-center">Qtd Máx.</th>
                          <th className="px-3 py-2 text-center">Qtd Dev.</th>
                          <th className="px-3 py-2 text-right">Valor</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {venda.itens.map((item) => {
                          const qtd = itens.get(item.produto_id) ?? 0
                          const sp = statusProduto.get(item.produto_id) ?? 'ok'
                          return (
                            <tr key={item.produto_id} className={qtd > 0 ? 'bg-blue-50/30' : ''}>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <input type="checkbox" checked={qtd > 0}
                                    onChange={(e) => {
                                      const m = new Map(itens)
                                      m.set(item.produto_id, e.target.checked ? item.quantidade : 0)
                                      setItens(m)
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                                  <div>
                                    <p className="font-medium text-gray-800 text-xs leading-tight">{item.nome}</p>
                                    <p className="text-[11px] text-gray-400">{fmt(item.preco_unitario)}/un.</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center text-xs text-gray-500">{item.quantidade}</td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => {
                                    const m = new Map(itens)
                                    m.set(item.produto_id, Math.max(0, (m.get(item.produto_id) ?? 0) - 1))
                                    setItens(m)
                                  }} className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 transition text-base leading-none">−</button>
                                  <span className="w-6 text-center text-sm font-bold">{qtd}</span>
                                  <button onClick={() => {
                                    const m = new Map(itens)
                                    m.set(item.produto_id, Math.min(item.quantidade, (m.get(item.produto_id) ?? 0) + 1))
                                    setItens(m)
                                  }} disabled={qtd >= item.quantidade}
                                    className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 transition text-base leading-none disabled:opacity-30 disabled:cursor-not-allowed">+</button>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className={`text-sm font-bold ${qtd > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                  {qtd > 0 ? fmt(qtd * item.preco_unitario) : '—'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <select value={sp} disabled={qtd === 0}
                                  onChange={(e) => {
                                    const m = new Map(statusProduto)
                                    m.set(item.produto_id, e.target.value)
                                    setStatusProduto(m)
                                  }}
                                  className={`rounded-lg border px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${statusCor(sp)}`}>
                                  {STATUS_PRODUTO.map((s) => (
                                    <option key={s.key} value={s.key}>{s.label}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm font-bold">
                    <span className="text-gray-600">Valor a devolver</span>
                    <span className={totalSelecionado > 0 ? 'text-red-600' : 'text-gray-400'}>
                      {totalSelecionado > 0 ? fmt(totalSelecionado) : '—'}
                    </span>
                  </div>
                </div>
              )}

              {/* Step 3 — Confirmar */}
              {step === 'confirmar' && venda && (
                <div className="space-y-5">
                  {/* Resumo itens */}
                  <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden text-sm">
                    {venda.itens.filter((i) => (itens.get(i.produto_id) ?? 0) > 0).map((i) => {
                      const q = itens.get(i.produto_id) ?? 0
                      const sp = statusProduto.get(i.produto_id) ?? 'ok'
                      return (
                        <div key={i.produto_id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-700 truncate">{i.nome} <span className="text-gray-400">× {q}</span></p>
                          </div>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${statusCor(sp)}`}>
                            {statusLabel(sp)}
                          </span>
                          <span className="font-semibold text-red-600 shrink-0">-{fmt(q * i.preco_unitario)}</span>
                        </div>
                      )
                    })}
                    <div className="flex justify-between px-4 py-3 bg-gray-50 font-bold">
                      <span className="text-gray-700">Total a devolver</span>
                      <span className="text-red-600">-{fmt(totalSelecionado)}</span>
                    </div>
                  </div>

                  {/* Pagamento original */}
                  {venda.forma_pagamento_nome && !venda.lancamento_pendente && (
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                      <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Pagamento original</p>
                      <p className="font-semibold text-gray-700">{venda.forma_pagamento_nome}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Selecione abaixo como será feita a devolução</p>
                    </div>
                  )}

                  {/* Motivo */}
                  <div>
                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Motivo (opcional)</label>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex: produto com defeito, troca de tamanho..."
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {/* Como devolver */}
                  <div>
                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">Como devolver?</label>
                    {venda.lancamento_pendente ? (
                      <div className="rounded-xl border-2 border-orange-300 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700">
                        🚫 Cancelar fiado — débito cancelado, sem reembolso em dinheiro
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <button onClick={() => venda.pessoa_id ? setTipoCredito('credito_conta') : null}
                          disabled={!venda.pessoa_id}
                          className={`w-full rounded-xl border-2 px-4 py-3 text-sm font-semibold transition flex items-center gap-3 ${
                            tipoCredito === 'credito_conta'
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : venda.pessoa_id
                                ? 'border-green-200 text-green-700 hover:bg-green-50'
                                : 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
                          }`}>
                          <span className="text-xl shrink-0">🏦</span>
                          <div className="text-left">
                            <p>Crédito na conta do cliente</p>
                            <p className={`text-xs font-normal ${venda.pessoa_id ? 'text-green-600' : 'text-gray-400'}`}>
                              {venda.pessoa_id ? 'Saldo fica disponível na próxima compra' : 'Requer cliente identificado na venda'}
                            </p>
                          </div>
                          {tipoCredito === 'credito_conta' && (
                            <svg className="h-4 w-4 ml-auto text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                            </svg>
                          )}
                        </button>
                        <div className="grid grid-cols-3 gap-2">
                          {CREDITO_OPTS.filter(op => !op.destaque).map((op) => (
                            <button key={op.key} onClick={() => setTipoCredito(op.key)}
                              className={`rounded-xl border-2 px-3 py-2.5 text-xs font-semibold transition flex flex-col items-center gap-1 ${
                                tipoCredito === op.key
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                              }`}>
                              <span className="text-base">{op.icon}</span>
                              {op.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-6 py-4 flex gap-3 shrink-0">
              {step !== 'buscar' && (
                <button onClick={() => setStep(step === 'confirmar' ? 'itens' : 'buscar')}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                  ← Voltar
                </button>
              )}
              {step === 'itens' && (
                <button onClick={() => { if (totalSelecionado > 0) setStep('confirmar') }}
                  disabled={totalSelecionado === 0}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                  Revisar devolução →
                </button>
              )}
              {step === 'confirmar' && (
                <button onClick={confirmar} disabled={salvando}
                  className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 transition disabled:opacity-50">
                  {salvando ? 'Registrando...' : `✓ Confirmar — ${fmt(totalSelecionado)}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Detalhe ────────────────────────────────────────────────── */}
      {(detalhe || carregandoDetalhe) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetalhe(null)}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-bold text-gray-900">Detalhes da Devolução</h3>
              <button onClick={() => setDetalhe(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {carregandoDetalhe && !detalhe
              ? <p className="py-14 text-center text-sm text-gray-400">Carregando...</p>
              : detalhe && (
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      { label: 'Data',    valor: fmtDt(detalhe.created_at) },
                      { label: 'Cliente', valor: detalhe.pessoa_nome ?? '—' },
                      { label: 'Crédito', valor: CREDITO_LABEL[detalhe.tipo_credito] ?? detalhe.tipo_credito },
                      { label: 'Motivo',  valor: detalhe.motivo ?? '—' },
                    ].map(({ label, valor }) => (
                      <div key={label}>
                        <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
                        <p className="text-gray-800 mt-0.5">{valor}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-xs font-semibold uppercase text-gray-400">
                          <th className="px-4 py-2 text-left">Produto</th>
                          <th className="px-4 py-2 text-center">Status</th>
                          <th className="px-4 py-2 text-right">Qtd</th>
                          <th className="px-4 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {detalhe.itens.map((i, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2.5 text-gray-800">{i.nome}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusCor(i.status_produto)}`}>
                                {statusLabel(i.status_produto)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-500">{i.quantidade}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-red-600">-{fmt(i.total_item)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-bold">
                          <td colSpan={3} className="px-4 py-2.5 text-gray-700">Total</td>
                          <td className="px-4 py-2.5 text-right text-red-600">
                            -{fmt(detalhe.itens.reduce((s, i) => s + i.total_item, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )
            }
          </div>
        </div>
      )}
    </div>
  )
}
