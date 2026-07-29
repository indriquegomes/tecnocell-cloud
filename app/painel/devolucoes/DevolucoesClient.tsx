'use client'

import { IconPlus } from '@/components/icons'
import { Spinner } from '@/components/Spinner'
import { MOTIVOS_DEVOLUCAO, motivoDevolucao } from '@/lib/motivos'
import { ResumoMotivos } from '@/components/ResumoMotivos'
import { useState, useEffect, useRef, useMemo } from 'react'
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
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' })
    + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
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
  motivo_tipo: string | null
  status_produto?: string
}

// ── Constantes ────────────────────────────────────────────────────────────────
// Rótulo enxuto e claro do destino da peça (pedido Isa: "OK-VENDA / TROCA-SAÍDA").
// A explicação completa fica no texto de ajuda logo abaixo da tabela.
const STATUS_PRODUTO = [
  { key: 'ok',    label: 'OK · Venda',    cor: 'bg-green-50 text-green-700 border-green-200' },
  { key: 'troca', label: 'Troca · Saída', cor: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
]
// rótulo dos status antigos (defeito/avaria) que ainda existam no histórico
const LABEL_ANTIGO: Record<string, string> = { defeito: 'Defeito', avaria: 'Avaria', troca: 'Troca · Saída', ok: 'OK · Venda' }
const statusCor = (s?: string) =>
  STATUS_PRODUTO.find(x => x.key === (s ?? 'ok'))?.cor
  ?? (s === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200')
const statusLabel = (s?: string) =>
  STATUS_PRODUTO.find(x => x.key === (s ?? 'ok'))?.label ?? LABEL_ANTIGO[s ?? 'ok'] ?? (s ?? 'OK')

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
  linhas, totalItens, totalValor, nDevolucoes, filtros, vendaInicial = null,
}: {
  linhas: ItemDevolucaoLinha[]
  totalItens: number
  totalValor: number
  nDevolucoes: number
  filtros: { de: string; ate: string; q: string }
  /** ?venda=<id> — veio do botão "Devolver produto" no detalhe da venda: já abre nela. */
  vendaInicial?: string | null
}) {
  const router = useRouter()

  // ── busca/filtros ──────────────────────────────────────────────────────────
  const [busca, setBusca] = useState(filtros.q)
  const [filtroDe, setFiltroDe] = useState(filtros.de)
  const [filtroAte, setFiltroAte] = useState(filtros.ate)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [filtroMotivo, setFiltroMotivo] = useState<string | null>(null)

  // Conta por DEVOLUÇÃO (não por item): 3 peças numa devolução são UM motivo, não três.
  const contagemMotivos = useMemo(() => {
    const vistas = new Set<string>()
    const acc: Record<string, { n: number; valor: number }> = {}
    for (const l of linhas) {
      const k = l.motivo_tipo ?? '__sem__'
      acc[k] ??= { n: 0, valor: 0 }
      acc[k].valor += l.total_item
      if (!vistas.has(l.devolucao_id)) { vistas.add(l.devolucao_id); acc[k].n += 1 }
    }
    return acc
  }, [linhas])

  const linhasFiltradas = useMemo(() => {
    let out = linhas
    if (filtroMotivo) out = out.filter(l => (l.motivo_tipo ?? '__sem__') === filtroMotivo)
    if (!busca.trim()) return out
    const b = busca.toLowerCase()
    return out.filter(l =>
      l.produto_nome.toLowerCase().includes(b) ||
      l.pessoa_nome?.toLowerCase().includes(b) ||
      l.venda_id?.toLowerCase().includes(b) ||
      l.operador?.toLowerCase().includes(b) ||
      l.motivo?.toLowerCase().includes(b) ||
      motivoDevolucao(l.motivo_tipo)?.label.toLowerCase().includes(b)
    )
  }, [linhas, busca, filtroMotivo])

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
  const [seriesSel, setSeriesSel] = useState<Map<string, string[]>>(new Map())  // produto_id → IMEIs escolhidos p/ devolver
  const [motivo, setMotivo] = useState('')
  const [motivoTipo, setMotivoTipo] = useState('')   // motivo FECHADO (o texto livre virou detalhe)
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
    setVenda(null); setItens(new Map()); setStatusProduto(new Map()); setSeriesSel(new Map())
    setMotivo(''); setMotivoTipo(''); setTipoCredito('dinheiro'); setErro('')
  }

  // Busca da venda: DEBOUNCE (350ms) + "último venceu" (ignora resposta velha) + loading
  // fica ligado até a busca CERTA voltar. Antes disparava a cada tecla (o Next serializa
  // server actions → fila) e o loading desligava na 1ª resposta, mostrando "Nenhuma venda
  // encontrada" antes do resultado certo chegar (reclamação da Isa 28/07).
  const seqBusca = useRef(0)
  useEffect(() => {
    if (!open || step !== 'buscar') return
    const seq = ++seqBusca.current
    setCarregandoBusca(true); setErro('')
    const id = setTimeout(async () => {
      try {
        const t = await authToken()
        if (!t) { if (seq === seqBusca.current) setErro('Sessão expirada.'); return }
        const res = await buscarVendasRecentes(t, buscaVenda)
        if (seq === seqBusca.current) setVendas(res)
      } catch (e) {
        if (seq === seqBusca.current) setErro(e instanceof Error ? e.message : 'Erro ao buscar vendas.')
      } finally {
        if (seq === seqBusca.current) setCarregandoBusca(false)
      }
    }, buscaVenda.trim() ? 350 : 0)   // vazio (abertura) carrega na hora
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaVenda, open, step])

  const selecionarVenda = async (id: string) => {
    setCarregandoVenda(true); setErro('')
    try {
      const t = await authToken()
      const v = await buscarVendaParaDevolucao(t, id)
      if (!v) { setErro('Venda não encontrada.'); return }
      setVenda(v)
      const m = new Map<string, number>()
      const sp = new Map<string, string>()
      // serializado começa sem nada marcado (operador escolhe os IMEIs); demais, quantidade cheia
      v.itens.forEach((i) => { m.set(i.produto_id, i.series.length > 0 ? 0 : i.quantidade); sp.set(i.produto_id, 'ok') })
      setItens(m); setStatusProduto(sp); setSeriesSel(new Map())
      // reembolso (parte paga) usa forma real; se for só fiado, o confirmar troca p/ cancelamento_fiado
      setTipoCredito('dinheiro')
      setStep('itens')
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar venda.') }
    finally { setCarregandoVenda(false) }
  }

  // Veio do botão "Devolver produto" no detalhe da venda (?venda=<id>): já abre nela,
  // sem a operadora ter que procurar a venda de novo.
  const jaAbriu = useRef(false)
  useEffect(() => {
    if (!vendaInicial || jaAbriu.current) return
    jaAbriu.current = true
    setOpen(true)                    // abre o modal de Nova Devolução
    selecionarVenda(vendaInicial)    // e já carrega os itens da venda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendaInicial])

  // O desconto da venda é ABATIMENTO DO PEDIDO, não dinheiro que o cliente pagou (Isa, 17/07).
  // Os itens guardam o preço de tabela; o desconto vive só no total da venda. Devolver pelo
  // preço cheio fazia o desconto virar "reembolso": venda de R$66 com R$18 de desconto e fiado
  // de R$48 devolvia R$48 de abate + R$18 em dinheiro pra quem nunca pagou nada.
  // Por isso o valor devolvido é proporcional ao que a venda REALMENTE custou.
  const totalCheio = venda
    ? venda.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
    : 0
  // Base do reembolso = total SEM a taxa de cartão (a taxa é repasse do custo da
  // maquininha, não valor de produto — não se devolve). Ver taxa_cartao na action.
  const fatorDesconto = venda && totalCheio > 0 ? (venda.total - venda.taxa_cartao) / totalCheio : 1
  const totalSelecionado = venda
    ? venda.itens.reduce((s, i) => s + (itens.get(i.produto_id) ?? 0) * i.preco_unitario, 0) * fatorDesconto
    : 0

  // Split da devolução: abate a dívida (fiado) primeiro; o resto foi pago → reembolso
  const abateFiado = venda ? Math.min(totalSelecionado, venda.fiado_restante) : 0
  const reembolso = Math.max(0, totalSelecionado - abateFiado)

  // Serializado: marca/desmarca IMEIs (quantidade = nº de IMEIs escolhidos)
  const toggleSerie = (produtoId: string, serie: string) => {
    setSeriesSel((prev) => {
      const cur = prev.get(produtoId) ?? []
      const next = cur.includes(serie) ? cur.filter((s) => s !== serie) : [...cur, serie]
      const m = new Map(prev); m.set(produtoId, next)
      setItens((pi) => { const mm = new Map(pi); mm.set(produtoId, next.length); return mm })
      return m
    })
  }
  const marcarTodasSeries = (produtoId: string, disponiveis: string[], marcar: boolean) => {
    setSeriesSel((prev) => { const m = new Map(prev); m.set(produtoId, marcar ? [...disponiveis] : []); return m })
    setItens((pi) => { const mm = new Map(pi); mm.set(produtoId, marcar ? disponiveis.length : 0); return mm })
  }

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
          // proporcional ao desconto da venda — o item vale o que foi cobrado, não a tabela
          total_item: (itens.get(i.produto_id) ?? 0) * i.preco_unitario * fatorDesconto,
          status_produto: statusProduto.get(i.produto_id) ?? 'ok',
          series: seriesSel.get(i.produto_id) ?? [],   // IMEIs escolhidos (vazio p/ não serializado)
        }))
      if (!itensDev.length) { setErro('Selecione ao menos um item.'); return }
      const semImei = itensDev.find((i) => venda.itens.find((x) => x.produto_id === i.produto_id)!.series.length > 0 && i.series.length === 0)
      if (semImei) { setErro(`Escolha o(s) IMEI(s) a devolver de "${semImei.nome}".`); return }
      await registrarDevolucao(t, {
        venda_id: venda.id, deposito_id: venda.deposito_id,
        pessoa_id: venda.pessoa_id, pessoa_nome: venda.pessoa_nome,
        vendedor_nome: venda.vendedor_nome, motivo, motivo_tipo: motivoTipo,
        // se não sobra reembolso (devolução só de fiado), registra como cancelamento de fiado
        tipo_credito: reembolso > 0.01 ? tipoCredito : 'cancelamento_fiado',
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
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 transition shadow-sm">
          <IconPlus className="h-4 w-4" />
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

      {/* Por que as peças voltam — clica na barra pra filtrar a lista */}
      <ResumoMotivos
        titulo="Por que as peças voltaram"
        motivos={MOTIVOS_DEVOLUCAO}
        contagem={contagemMotivos}
        selecionado={filtroMotivo}
        onSelecionar={setFiltroMotivo}
        legenda="Uma devolução conta uma vez, mesmo com várias peças. Clique numa barra pra ver só ela."
      />

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
                <tr key={l.item_id} className="hover:bg-blue-50/60/60 transition group">
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
                    {(() => {
                      const m = motivoDevolucao(l.motivo_tipo)
                      return (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {m && (
                            <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${m.cor}`}>
                              {m.icone} {m.label}
                            </span>
                          )}
                          {l.motivo && <span className="truncate text-xs text-gray-400">{l.motivo}</span>}
                        </div>
                      )
                    })()}
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
                    onChange={(e) => setBuscaVenda(e.target.value)}
                    placeholder="Nome do cliente ou número da venda..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
                  {carregandoBusca && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-blue-100">
                      <div className="h-full w-1/3 rounded-full bg-blue-600" style={{ animation: 'barra 1s ease-in-out infinite' }} />
                    </div>
                  )}
                  {carregandoBusca
                    ? <p className="py-8 text-center text-sm text-gray-400">Buscando venda...</p>
                    : vendas.length === 0
                      ? <p className="py-8 text-center text-sm text-gray-400">{
                          !buscaVenda.trim() ? 'Digite o número da venda ou o nome do cliente.'
                          : /^\d+$/.test(buscaVenda.trim()) ? `Venda #${buscaVenda.trim()} não encontrada (ou já foi devolvida).`
                          : 'Nenhuma venda encontrada.'
                        }</p>
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
                    {venda.fiado_restante > 0.01 && (
                      <p className="mt-2 text-xs font-semibold text-orange-600 bg-orange-50 rounded-lg px-2 py-1">
                        ⚠️ Fiado em aberto: {fmt(venda.fiado_restante)} — a devolução abate essa dívida primeiro
                      </p>
                    )}
                  </div>

                  {/* Tabela de mercadorias (estilo SIGE) */}
                  <div className="rounded-xl border border-gray-100 overflow-x-auto">
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
                          const serial = item.series.length > 0
                          const sel = seriesSel.get(item.produto_id) ?? []
                          return (
                            <tr key={item.produto_id} className={qtd > 0 ? 'bg-blue-50/30' : ''}>
                              <td className="px-3 py-2.5">
                                <div className="flex items-start gap-2">
                                  <input type="checkbox" checked={qtd > 0}
                                    onChange={(e) => {
                                      if (serial) { marcarTodasSeries(item.produto_id, item.series, e.target.checked); return }
                                      const m = new Map(itens)
                                      m.set(item.produto_id, e.target.checked ? item.quantidade : 0)
                                      setItens(m)
                                    }}
                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-800 text-xs leading-tight">{item.nome}</p>
                                    <p className="text-[11px] text-gray-400">{fmt(item.preco_unitario)}/un.</p>
                                    {serial && (
                                      <div className="mt-1.5 flex flex-wrap gap-1">
                                        {item.series.map((s) => {
                                          const on = sel.includes(s)
                                          return (
                                            <button key={s} type="button" onClick={() => toggleSerie(item.produto_id, s)}
                                              className={`rounded-full border px-2 py-0.5 text-[11px] font-mono transition ${on ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'}`}>
                                              {on ? '✓ ' : ''}{s}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center text-xs text-gray-500">{item.quantidade}</td>
                              <td className="px-3 py-2.5 text-center">
                                {serial ? (
                                  <span className="text-sm font-bold">{qtd}</span>
                                ) : (
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
                                )}
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

                  <p className="text-[11px] text-gray-400 px-1">
                    <b className="text-green-600">OK — Venda</b> = peça boa, volta pro estoque e pode vender de novo · <b className="text-yellow-600">Troca — Saída</b> = peça sai do estoque (fornecedor/caixinha), não volta
                  </p>

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

                  {/* Motivo — FECHADO e obrigatório.
                      Era texto livre e as 6 devoluções existentes tinham motivo NULL:
                      ninguém preenche, e o que se preenche não dá pra somar. A pergunta
                      "por que as peças voltam?" só tem resposta se der pra CONTAR. */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">
                      Por que a peça voltou? <span className="text-red-500">*</span>
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {MOTIVOS_DEVOLUCAO.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMotivoTipo(m.id)}
                          className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                            motivoTipo === m.id ? `${m.cor} font-semibold ring-1 ring-inset` : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <span className="mr-1.5">{m.icone}</span>{m.label}
                        </button>
                      ))}
                    </div>
                    {motivoTipo && (
                      <p className="mt-1.5 text-xs text-gray-400">
                        {MOTIVOS_DEVOLUCAO.find((m) => m.id === motivoTipo)?.ajuda}
                      </p>
                    )}
                    <input
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder={motivoTipo === 'outro' ? 'Escreva o motivo…' : 'Detalhe (opcional)'}
                      required={motivoTipo === 'outro'}
                      className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Split: abate dívida × reembolso */}
                  {(abateFiado > 0.01 || reembolso > 0.01) && (
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm space-y-1">
                      {abateFiado > 0.01 && (
                        <div className="flex justify-between"><span className="text-gray-600">🤝 Abate da dívida (fiado)</span><span className="font-semibold text-orange-600">{fmt(abateFiado)}</span></div>
                      )}
                      {reembolso > 0.01 && (
                        <div className="flex justify-between"><span className="text-gray-600">💵 Reembolso (parte que o cliente pagou)</span><span className="font-semibold text-blue-600">{fmt(reembolso)}</span></div>
                      )}
                    </div>
                  )}

                  {/* Como reembolsar a parte paga */}
                  <div>
                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                      {reembolso > 0.01 ? `Reembolsar ${fmt(reembolso)} como?` : 'Como devolver?'}
                    </label>
                    {reembolso <= 0.01 ? (
                      <div className="rounded-xl border-2 border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700">
                        🤝 Só abate a dívida do cliente — sem reembolso (nada foi pago por esses itens).
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
                        {/* De ONDE sai o dinheiro — o Vitor pediu clareza: dinheiro é gaveta,
                            cartão/PIX é estorno (não mexe na gaveta). */}
                        <p className="mt-2 text-xs text-gray-500">
                          {tipoCredito === 'dinheiro'
                            ? '💵 Sai da gaveta do caixa aberto — o fechamento já desconta.'
                            : tipoCredito === 'debito' || tipoCredito === 'credito'
                            ? '💳 Estorno pela maquininha — você faz na máquina. Não sai da gaveta.'
                            : tipoCredito === 'pix'
                            ? '💠 Estorno pela conta (PIX). Não sai da gaveta.'
                            : tipoCredito === 'sem_reembolso'
                            ? '— Sem devolução de valor (troca ou cortesia).'
                            : ''}
                        </p>
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
                <button onClick={confirmar} disabled={salvando || !motivoTipo || (motivoTipo === 'outro' && !motivo.trim())}
                  title={!motivoTipo ? 'Escolha por que a peça voltou' : undefined}
                  className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 transition disabled:opacity-50">
                  {salvando
                    ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Registrando...</span>
                    : !motivoTipo ? 'Escolha o motivo acima'
                    : `✓ Confirmar — ${fmt(totalSelecionado)}`}
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
                  <div className="rounded-xl border border-gray-100 overflow-x-auto">
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
