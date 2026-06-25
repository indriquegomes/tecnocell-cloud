'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { criarOS, atualizarStatusOS, buscarClientes, type OrdemServico, type StatusOS } from './actions'

const supabaseBrowser = createClient()
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })

const STATUS_MAP: Record<StatusOS, { label: string; cor: string }> = {
  aberta:          { label: 'Aberta',         cor: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  em_andamento:    { label: 'Em andamento',    cor: 'bg-blue-50 text-blue-700 border-blue-200' },
  aguardando_peca: { label: 'Aguard. peça',    cor: 'bg-orange-50 text-orange-700 border-orange-200' },
  pronta:          { label: 'Pronta p/ retirada', cor: 'bg-green-50 text-green-700 border-green-200' },
  entregue:        { label: 'Entregue',        cor: 'bg-gray-100 text-gray-500 border-gray-200' },
  cancelada:       { label: 'Cancelada',       cor: 'bg-red-50 text-red-600 border-red-200' },
}

const PROXIMOS_STATUS: Record<StatusOS, { status: StatusOS; label: string }[]> = {
  aberta:          [{ status: 'em_andamento', label: 'Iniciar reparo' }, { status: 'cancelada', label: 'Cancelar' }],
  em_andamento:    [{ status: 'aguardando_peca', label: 'Aguardar peça' }, { status: 'pronta', label: 'Marcar pronta' }, { status: 'cancelada', label: 'Cancelar' }],
  aguardando_peca: [{ status: 'em_andamento', label: 'Retomar reparo' }, { status: 'pronta', label: 'Marcar pronta' }],
  pronta:          [{ status: 'entregue', label: 'Registrar entrega' }],
  entregue:        [],
  cancelada:       [],
}

function BadgeOS({ status }: { status: string }) {
  const s = STATUS_MAP[status as StatusOS] ?? { label: status, cor: 'bg-gray-100 text-gray-500 border-gray-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cor}`}>
      {s.label}
    </span>
  )
}

export function OSClient({
  ordens, filtros,
}: {
  ordens: OrdemServico[]
  filtros: { q: string; status: string }
}) {
  const router = useRouter()
  const [busca, setBusca] = useState(filtros.q)
  const [filtroStatus, setFiltroStatus] = useState(filtros.status)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Modal nova OS
  const [openNova, setOpenNova] = useState(false)
  const [form, setForm] = useState({
    pessoa_nome: '', pessoa_id: null as string | null,
    equipamento: '', marca: '', modelo: '', numero_serie: '',
    defeito_relatado: '', observacoes: '', tecnico_nome: '',
  })
  const [clientesBusca, setClientesBusca] = useState('')
  const [clientes, setClientes] = useState<{ id: string; nome: string; telefone: string | null }[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  // Modal detalhe/status
  const [osDetalhe, setOsDetalhe] = useState<OrdemServico | null>(null)
  const [atualizando, setAtualizando] = useState(false)

  const authToken = async () => {
    const { data } = await supabaseBrowser.auth.getSession()
    return data.session?.access_token ?? ''
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpenNova(false); setOsDetalhe(null) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!clientesBusca.trim()) { setClientes([]); return }
    const t = setTimeout(async () => {
      const token = await authToken()
      setClientes(await buscarClientes(token, clientesBusca).catch(() => []))
    }, 250)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesBusca])

  const ordensFiltradas = useMemo(() => {
    let r = ordens
    if (busca.trim()) {
      const b = busca.toLowerCase()
      r = r.filter(o =>
        o.pessoa_nome?.toLowerCase().includes(b) ||
        o.equipamento.toLowerCase().includes(b) ||
        o.modelo?.toLowerCase().includes(b) ||
        o.marca?.toLowerCase().includes(b) ||
        o.defeito_relatado?.toLowerCase().includes(b) ||
        String(o.numero).includes(b)
      )
    }
    if (filtroStatus) r = r.filter(o => o.status === filtroStatus)
    return r
  }, [ordens, busca, filtroStatus])

  const ativas = ordensFiltradas.filter(o => !['entregue', 'cancelada'].includes(o.status))
  const historico = ordensFiltradas.filter(o => ['entregue', 'cancelada'].includes(o.status))

  const abertas     = ordens.filter(o => o.status === 'aberta').length
  const emAndamento = ordens.filter(o => ['em_andamento', 'aguardando_peca'].includes(o.status)).length
  const prontas     = ordens.filter(o => o.status === 'pronta').length
  const totalAtivas = ordens.filter(o => !['entregue', 'cancelada'].includes(o.status)).length

  const fecharNova = () => {
    setOpenNova(false)
    setForm({ pessoa_nome: '', pessoa_id: null, equipamento: '', marca: '', modelo: '', numero_serie: '', defeito_relatado: '', observacoes: '', tecnico_nome: '' })
    setClientesBusca(''); setClientes([]); setErro('')
  }

  const salvarOS = async () => {
    if (!form.equipamento.trim() || !form.defeito_relatado.trim()) {
      setErro('Equipamento e defeito são obrigatórios.')
      return
    }
    setSalvando(true); setErro('')
    try {
      const t = await authToken()
      await criarOS(t, { ...form, marca: form.marca || null, modelo: form.modelo || null, numero_serie: form.numero_serie || null, observacoes: form.observacoes || null, tecnico_nome: form.tecnico_nome || null })
      fecharNova()
      setSucesso('OS criada com sucesso!')
      setTimeout(() => setSucesso(''), 4000)
      router.refresh()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao criar OS.') }
    finally { setSalvando(false) }
  }

  const mudarStatus = async (os: OrdemServico, novoStatus: StatusOS) => {
    setAtualizando(true)
    try {
      const t = await authToken()
      await atualizarStatusOS(t, os.id, novoStatus)
      setOsDetalhe(null)
      router.refresh()
    } finally { setAtualizando(false) }
  }

  const aplicarFiltros = () => {
    const p = new URLSearchParams({ q: busca, status: filtroStatus })
    router.push(`/painel/os?${p}`)
  }

  return (
    <div className="space-y-5">

      {/* Toast */}
      {sucesso && (
        <div className="fixed top-5 right-5 z-[60] rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          ✅ {sucesso}
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Assistência Técnica</p>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Ordens de Serviço</h2>
        </div>
        <button onClick={() => setOpenNova(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 transition shadow-sm">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Nova OS
        </button>
      </div>

      {/* ── Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Abertas',      valor: abertas,     cor: 'text-yellow-600' },
          { label: 'Em andamento', valor: emAndamento, cor: 'text-blue-600' },
          { label: 'Prontas',      valor: prontas,     cor: 'text-green-600' },
          { label: 'Total ativas', valor: totalAtivas, cor: 'text-gray-900' },
        ].map(({ label, valor, cor }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${cor}`}>{valor}</p>
          </div>
        ))}
      </div>

      {/* ── Busca + filtros ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
        <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') aplicarFiltros() }}
          placeholder="Buscar por cliente, equipamento, marca, defeito, nº OS..."
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
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mostrarFiltros ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
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
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex-wrap">
          <span className="text-xs font-semibold text-blue-700 uppercase">Status</span>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFiltroStatus('')}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${!filtroStatus ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
              Todos
            </button>
            {Object.entries(STATUS_MAP).map(([key, { label, cor }]) => (
              <button key={key} onClick={() => setFiltroStatus(filtroStatus === key ? '' : key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filtroStatus === key ? 'bg-blue-600 text-white border-blue-600' : `${cor} hover:opacity-80`}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabela OS ativas ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">OS Ativas</span>
            {ativas.length > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                {ativas.length} em aberto
              </span>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/80 text-left">
                {['Nº OS', 'Cliente', 'Equipamento', 'Defeito', 'Técnico', 'Status', 'Total', 'Data', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ativas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <p className="text-3xl mb-2">🔧</p>
                    <p className="text-sm text-gray-400">Nenhuma OS ativa.</p>
                    <button onClick={() => setOpenNova(true)} className="mt-3 text-xs text-blue-500 hover:underline">
                      Criar primeira OS →
                    </button>
                  </td>
                </tr>
              ) : ativas.map(o => (
                <tr key={o.id} className="hover:bg-gray-50/60 transition group">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                      #{String(o.numero).padStart(4, '0')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-[120px] truncate">
                    {o.pessoa_nome ?? <span className="italic text-gray-400 font-normal">Sem cliente</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[140px]">
                    <p className="font-medium truncate">{o.equipamento}</p>
                    {(o.marca || o.modelo) && (
                      <p className="text-xs text-gray-400 truncate">{[o.marca, o.modelo].filter(Boolean).join(' · ')}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[180px]">
                    <p className="truncate text-xs">{o.defeito_relatado ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {o.tecnico_nome ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3"><BadgeOS status={o.status} /></td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800 whitespace-nowrap">
                    {o.total > 0 ? fmt(o.total) : <span className="text-gray-300 font-normal">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDt(o.created_at)}</td>
                  <td className="px-3 py-3 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => setOsDetalhe(o)}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 transition whitespace-nowrap">
                      Gerenciar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Histórico ───────────────────────────────────────────────────── */}
      {historico.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <span className="text-sm font-semibold text-gray-500">Histórico</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/80 text-left">
                  {['Nº OS', 'Cliente', 'Equipamento', 'Status', 'Total', 'Data'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 opacity-60">
                {historico.map(o => (
                  <tr key={o.id} className="hover:opacity-100 transition">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-400">#{String(o.numero).padStart(4, '0')}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{o.pessoa_nome ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{o.equipamento} {o.modelo && `· ${o.modelo}`}</td>
                    <td className="px-4 py-3"><BadgeOS status={o.status} /></td>
                    <td className="px-4 py-3 text-gray-700">{o.total > 0 ? fmt(o.total) : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmtDt(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal Nova OS ────────────────────────────────────────────────── */}
      {openNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={fecharNova}>
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
              <h3 className="text-base font-bold text-gray-900">Nova Ordem de Serviço</h3>
              <button onClick={fecharNova} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Cliente */}
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Cliente</label>
                <div className="relative">
                  <input value={form.pessoa_id ? form.pessoa_nome : clientesBusca}
                    onChange={(e) => {
                      if (form.pessoa_id) { setForm(f => ({ ...f, pessoa_id: null, pessoa_nome: '' })) }
                      setClientesBusca(e.target.value)
                      setForm(f => ({ ...f, pessoa_nome: e.target.value }))
                    }}
                    placeholder="Buscar cliente ou digitar nome..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {clientes.length > 0 && !form.pessoa_id && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
                      {clientes.map(c => (
                        <button key={c.id} onClick={() => {
                          setForm(f => ({ ...f, pessoa_id: c.id, pessoa_nome: c.nome }))
                          setClientesBusca(''); setClientes([])
                        }} className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-blue-50 transition text-left">
                          <span className="font-medium text-gray-800">{c.nome}</span>
                          {c.telefone && <span className="text-xs text-gray-400">{c.telefone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Equipamento */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">
                    Equipamento <span className="text-red-400">*</span>
                  </label>
                  <input value={form.equipamento} onChange={e => setForm(f => ({ ...f, equipamento: e.target.value }))}
                    placeholder="Ex: Smartphone, Notebook, Tablet..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Marca</label>
                  <input value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))}
                    placeholder="Samsung, Apple..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Modelo</label>
                  <input value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))}
                    placeholder="Galaxy A54, iPhone 14..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Número de série</label>
                  <input value={form.numero_serie} onChange={e => setForm(f => ({ ...f, numero_serie: e.target.value }))}
                    placeholder="Opcional"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Técnico</label>
                  <input value={form.tecnico_nome} onChange={e => setForm(f => ({ ...f, tecnico_nome: e.target.value }))}
                    placeholder="Nome do técnico"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Defeito */}
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">
                  Defeito relatado <span className="text-red-400">*</span>
                </label>
                <textarea value={form.defeito_relatado} onChange={e => setForm(f => ({ ...f, defeito_relatado: e.target.value }))}
                  placeholder="Descreva o problema relatado pelo cliente..."
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Observações internas</label>
                <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Anotações para o técnico (não aparece na OS do cliente)..."
                  rows={2}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
            </div>

            <div className="border-t border-gray-100 px-6 py-4 flex gap-3 shrink-0">
              <button onClick={fecharNova}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={salvarOS} disabled={salvando}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-50">
                {salvando ? 'Criando OS...' : '✓ Criar OS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Gerenciar OS ───────────────────────────────────────────── */}
      {osDetalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOsDetalhe(null)}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  OS #{String(osDetalhe.numero).padStart(4, '0')}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">{osDetalhe.pessoa_nome ?? 'Sem cliente'}</p>
              </div>
              <button onClick={() => setOsDetalhe(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'Equipamento', valor: osDetalhe.equipamento },
                  { label: 'Marca/Modelo', valor: [osDetalhe.marca, osDetalhe.modelo].filter(Boolean).join(' ') || '—' },
                  { label: 'Técnico', valor: osDetalhe.tecnico_nome ?? '—' },
                  { label: 'Data entrada', valor: fmtDt(osDetalhe.created_at) },
                ].map(({ label, valor }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
                    <p className="text-gray-800 mt-0.5">{valor}</p>
                  </div>
                ))}
              </div>

              {osDetalhe.defeito_relatado && (
                <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Defeito relatado</p>
                  <p className="text-sm text-gray-700">{osDetalhe.defeito_relatado}</p>
                </div>
              )}

              {/* Status atual + ações */}
              <div>
                <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Status atual</p>
                <BadgeOS status={osDetalhe.status} />
              </div>

              {PROXIMOS_STATUS[osDetalhe.status].length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Alterar status</p>
                  <div className="flex flex-col gap-2">
                    {PROXIMOS_STATUS[osDetalhe.status].map(({ status, label }) => (
                      <button key={status} disabled={atualizando}
                        onClick={() => mudarStatus(osDetalhe, status)}
                        className={`rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                          status === 'cancelada'
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : status === 'entregue'
                              ? 'border-green-500 bg-green-50 text-green-700 hover:bg-green-100'
                              : 'border-blue-200 text-blue-700 hover:bg-blue-50'
                        }`}>
                        {atualizando ? '...' : label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
