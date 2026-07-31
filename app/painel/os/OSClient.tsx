'use client'

import { IconPlus } from '@/components/icons'
import { useState, useMemo, useEffect } from 'react'
import { Spinner } from '@/components/Spinner'
import { useRouter } from 'next/navigation'
import { criarOS, atualizarStatusOS, buscarClientesOS, criarClienteRapidoOS, atualizarValoresOS, listarChecklistsOS, aplicarChecklistOS, salvarChecklistOS, removerChecklistOS, type OrdemServico, type StatusOS, type ChecklistOS } from './actions'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })

const STATUS_MAP: Record<StatusOS, { label: string; cor: string }> = {
  aguardando:      { label: 'Aguardando',       cor: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  em_reparo:       { label: 'Em reparo',         cor: 'bg-blue-50 text-blue-700 border-blue-200' },
  aguardando_peca: { label: 'Aguard. peça',      cor: 'bg-orange-50 text-orange-700 border-orange-200' },
  pronto:          { label: 'Pronto p/ retirada',cor: 'bg-green-50 text-green-700 border-green-200' },
  entregue:        { label: 'Entregue',          cor: 'bg-gray-100 text-gray-500 border-gray-200' },
  cancelado:       { label: 'Cancelado',         cor: 'bg-red-50 text-red-600 border-red-200' },
  orcamento:       { label: 'Orçamento',         cor: 'bg-purple-50 text-purple-700 border-purple-200' },
  finalizada:      { label: 'Finalizada',        cor: 'bg-green-50 text-green-700 border-green-200' },
  nao_finalizada:  { label: 'Não finalizada',    cor: 'bg-amber-50 text-amber-700 border-amber-200' },
}

const PROXIMOS: Record<StatusOS, { status: StatusOS; label: string }[]> = {
  aguardando:      [{ status: 'em_reparo', label: 'Iniciar reparo' }, { status: 'cancelado', label: 'Cancelar' }],
  em_reparo:       [{ status: 'aguardando_peca', label: 'Aguardar peça' }, { status: 'pronto', label: 'Marcar pronto' }, { status: 'cancelado', label: 'Cancelar' }],
  aguardando_peca: [{ status: 'em_reparo', label: 'Retomar reparo' }, { status: 'pronto', label: 'Marcar pronto' }],
  pronto:          [{ status: 'entregue', label: 'Registrar entrega' }],
  entregue:        [],
  cancelado:       [],
  orcamento:       [{ status: 'nao_finalizada', label: 'Aprovar (iniciar)' }, { status: 'cancelado', label: 'Cancelar' }],
  nao_finalizada:  [{ status: 'finalizada', label: 'Finalizar' }, { status: 'cancelado', label: 'Cancelar' }],
  finalizada:      [{ status: 'entregue', label: 'Registrar entrega' }],
}

// OS "vencida": previsão de entrega já passou e ainda está aberta (não finalizada/
// entregue/pronta/cancelada). Derivado — não é status guardado. Isa 29/07.
const ABERTAS = ['aguardando', 'em_reparo', 'aguardando_peca', 'orcamento', 'nao_finalizada']
function estaVencida(o: { previsao_entrega: string | null; status: string }): boolean {
  return !!o.previsao_entrega && new Date(o.previsao_entrega) < new Date() && ABERTAS.includes(o.status)
}

function BadgeOS({ status }: { status: string }) {
  const s = STATUS_MAP[status as StatusOS] ?? { label: status, cor: 'bg-gray-100 text-gray-500 border-gray-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cor}`}>
      {s.label}
    </span>
  )
}

export function OSClient({ ordens, tecnicos = [], modelosChecklist = [], filtros }: { ordens: OrdemServico[]; tecnicos?: { id: string; nome: string }[]; modelosChecklist?: { id: string; nome: string }[]; filtros: { q: string; status: string } }) {
  const router = useRouter()
  const [busca, setBusca] = useState(filtros.q)
  const [filtroStatus, setFiltroStatus] = useState(filtros.status)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Modal nova OS
  const [openNova, setOpenNova] = useState(false)
  const [pessoaId, setPessoaId] = useState<string | null>(null)
  const [pessoaNomeInput, setPessoaNomeInput] = useState('')
  const [criandoCliente, setCriandoCliente] = useState(false)
  const [sugestoes, setSugestoes] = useState<{ id: string; nome: string; telefone: string | null }[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erroNova, setErroNova] = useState('')

  // Modal gerenciar
  const [osDetalhe, setOsDetalhe] = useState<OrdemServico | null>(null)

  // Check-lists aplicados na OS aberta (Etapa 4)
  const [checklistsOS, setChecklistsOS] = useState<ChecklistOS[]>([])
  const [aplicandoModelo, setAplicandoModelo] = useState('')
  const carregarChecklists = async (osId: string) => setChecklistsOS(await listarChecklistsOS(osId))
  // Valores da OS (valor cobrado + custo → lucro). Etapa lucro/custo.
  const [valorInput, setValorInput] = useState('')
  const [custoInput, setCustoInput] = useState('')
  const [salvandoValores, setSalvandoValores] = useState(false)
  useEffect(() => {
    if (osDetalhe) {
      carregarChecklists(osDetalhe.id)
      setValorInput(osDetalhe.total ? String(osDetalhe.total) : '')
      setCustoInput(osDetalhe.custo ? String(osDetalhe.custo) : '')
    } else setChecklistsOS([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osDetalhe?.id])
  const salvarValores = async () => {
    if (!osDetalhe) return
    setSalvandoValores(true)
    const total = parseFloat(valorInput) || 0
    const custo = parseFloat(custoInput) || 0
    await atualizarValoresOS(osDetalhe.id, total, custo)
    setSalvandoValores(false)
    setOsDetalhe({ ...osDetalhe, total, custo })
  }
  const aplicarChecklist = async () => {
    if (!aplicandoModelo || !osDetalhe) return
    await aplicarChecklistOS(osDetalhe.id, aplicandoModelo)
    setAplicandoModelo('')
    carregarChecklists(osDetalhe.id)
  }
  const toggleItemChecklist = async (cl: ChecklistOS, idx: number) => {
    const novos = cl.itens.map((it, i) => (i === idx ? { ...it, ok: !it.ok } : it))
    setChecklistsOS((prev) => prev.map((c) => (c.id === cl.id ? { ...c, itens: novos } : c)))
    await salvarChecklistOS(cl.id, novos)
  }
  const removerChecklist = async (id: string) => {
    setChecklistsOS((prev) => prev.filter((c) => c.id !== id))
    await removerChecklistOS(id)
  }
  const [atualizando, setAtualizando] = useState(false)
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpenNova(false); setOsDetalhe(null) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const q = pessoaNomeInput.trim()
    if (!q || pessoaId) { setSugestoes([]); return }
    const t = setTimeout(async () => {
      const res = await buscarClientesOS(q)
      setSugestoes(res)
    }, 250)
    return () => clearTimeout(t)
  }, [pessoaNomeInput, pessoaId])

  const ordensFiltradas = useMemo(() => {
    let r = ordens
    if (busca.trim()) {
      const b = busca.toLowerCase()
      r = r.filter(o =>
        o.pessoa_nome?.toLowerCase().includes(b) ||
        o.aparelho?.toLowerCase().includes(b) ||
        o.modelo?.toLowerCase().includes(b) ||
        o.problema.toLowerCase().includes(b) ||
        String(o.numero).includes(b)
      )
    }
    if (filtroStatus === 'vencida') r = r.filter(estaVencida)
    else if (filtroStatus) r = r.filter(o => o.status === filtroStatus)
    return r
  }, [ordens, busca, filtroStatus])

  const ativas   = ordensFiltradas.filter(o => !['entregue', 'cancelado'].includes(o.status))
  const historico = ordensFiltradas.filter(o => ['entregue', 'cancelado'].includes(o.status))

  const fecharNova = () => { setOpenNova(false); setPessoaId(null); setPessoaNomeInput(''); setSugestoes([]); setErroNova('') }

  const handleSalvarOS = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSalvando(true); setErroNova('')
    const fd = new FormData(e.currentTarget)
    if (pessoaId) fd.set('pessoa_id', pessoaId)
    fd.set('pessoa_nome', pessoaNomeInput)
    const res = await criarOS(fd)
    if (res?.error) { setErroNova(res.error); setSalvando(false) }
    // redirect acontece dentro da action se OK
  }

  const mudarStatus = async (os: OrdemServico, novoStatus: StatusOS) => {
    setAtualizando(true)
    await atualizarStatusOS(os.id, novoStatus)
    setOsDetalhe(null)
    setSucesso(`OS #${String(os.numero).padStart(4,'0')} atualizada!`)
    setTimeout(() => setSucesso(''), 3000)
    router.refresh()
    setAtualizando(false)
  }

  const aplicarFiltros = () => {
    const p = new URLSearchParams({ q: busca, status: filtroStatus })
    router.push(`/painel/os?${p}`)
  }

  const aguardando = ordens.filter(o => o.status === 'aguardando').length
  const emReparo   = ordens.filter(o => ['em_reparo', 'aguardando_peca'].includes(o.status)).length
  const prontos    = ordens.filter(o => o.status === 'pronto').length
  const totalAtivas = ordens.filter(o => !['entregue', 'cancelado'].includes(o.status)).length

  return (
    <div className="space-y-5">
      {sucesso && (
        <div className="fixed top-5 right-5 z-[60] rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          ✅ {sucesso}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Assistência Técnica</p>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Ordens de Serviço</h2>
        </div>
        <button onClick={() => setOpenNova(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition shadow-sm">
          <IconPlus className="h-4 w-4" />
          Nova OS
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Aguardando', valor: aguardando, cor: 'text-yellow-600' },
          { label: 'Em reparo',  valor: emReparo,   cor: 'text-blue-600' },
          { label: 'Prontos',    valor: prontos,     cor: 'text-green-600' },
          { label: 'Total ativas',valor: totalAtivas,cor: 'text-gray-900' },
        ].map(({ label, valor, cor }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${cor}`}>{valor}</p>
          </div>
        ))}
      </div>

      {/* Busca */}
      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
        <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input value={busca} onChange={e => setBusca(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') aplicarFiltros() }}
          placeholder="Buscar por cliente, aparelho, modelo, nº OS..."
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400" />
        {busca && <button onClick={() => setBusca('')} className="text-gray-300 hover:text-gray-500 text-xs">✕</button>}
        <div className="h-4 w-px bg-gray-200 mx-1" />
        <button onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mostrarFiltros ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
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
            {Object.entries(STATUS_MAP).map(([key, { label }]) => (
              <button key={key} onClick={() => setFiltroStatus(filtroStatus === key ? '' : key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filtroStatus === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                {label}
              </button>
            ))}
            <button onClick={() => setFiltroStatus(filtroStatus === 'vencida' ? '' : 'vencida')}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filtroStatus === 'vencida' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-200 hover:border-red-300'}`}>
              ⏰ Vencida
            </button>
          </div>
        </div>
      )}

      {/* Tabela OS ativas */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3 flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">OS Ativas</span>
          {ativas.length > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{ativas.length}</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/80 text-left">
                {['Nº OS', 'Cliente', 'Aparelho', 'Problema', 'Técnico', 'Status', 'Total', 'Data', ''].map(h => (
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
                <tr key={o.id} className="hover:bg-blue-50/60/60 transition group">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                      #{String(o.numero).padStart(4, '0')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-[120px] truncate">
                    {o.pessoa_nome ?? <span className="italic text-gray-400 font-normal">Sem cliente</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[140px]">
                    <p className="font-medium truncate">{o.aparelho ?? '—'}</p>
                    {o.modelo && <p className="text-xs text-gray-400 truncate">{o.modelo}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[180px]">
                    <p className="truncate text-xs">{o.problema}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {o.tecnico_nome ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3"><BadgeOS status={o.status} />{estaVencida(o) && <span className="ml-1 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 whitespace-nowrap">⏰ Vencida</span>}</td>
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

      {/* Histórico */}
      {historico.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <span className="text-sm font-semibold text-gray-500">Histórico</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/80 text-left">
                  {['Nº OS', 'Cliente', 'Aparelho', 'Status', 'Total', 'Data'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 opacity-60">
                {historico.map(o => (
                  <tr key={o.id} className="hover:opacity-100 transition">
                    <td className="px-4 py-3"><span className="font-mono text-xs text-gray-400">#{String(o.numero).padStart(4, '0')}</span></td>
                    <td className="px-4 py-3 text-gray-700">{o.pessoa_nome ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{o.aparelho ?? '—'}{o.modelo ? ` · ${o.modelo}` : ''}</td>
                    <td className="px-4 py-3"><BadgeOS status={o.status} />{estaVencida(o) && <span className="ml-1 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 whitespace-nowrap">⏰ Vencida</span>}</td>
                    <td className="px-4 py-3 text-gray-700">{o.total > 0 ? fmt(o.total) : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmtDt(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nova OS */}
      {openNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={fecharNova}>
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
              <h3 className="text-base font-bold text-gray-900">Nova Ordem de Serviço</h3>
              <button onClick={fecharNova} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition">✕</button>
            </div>

            <form onSubmit={handleSalvarOS} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Cliente */}
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Cliente</label>
                <div className="relative">
                  <input
                    value={pessoaNomeInput}
                    onChange={e => { setPessoaNomeInput(e.target.value); if (pessoaId) setPessoaId(null) }}
                    placeholder="Buscar cliente ou digitar nome..."
                    className="field w-full" />
                  {sugestoes.length > 0 && !pessoaId && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
                      {sugestoes.map(c => (
                        <button key={c.id} type="button"
                          onMouseDown={e => { e.preventDefault(); setPessoaId(c.id); setPessoaNomeInput(c.nome); setSugestoes([]) }}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-blue-50 transition text-left">
                          <span className="font-medium text-gray-800">{c.nome}</span>
                          {c.telefone && <span className="text-xs text-gray-400">{c.telefone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {pessoaId && <p className="mt-1 text-xs text-green-600">✓ {pessoaNomeInput} selecionado</p>}
                {!pessoaId && sugestoes.length === 0 && pessoaNomeInput.trim().length >= 2 && (
                  <button type="button" disabled={criandoCliente}
                    onClick={async () => {
                      setCriandoCliente(true)
                      const r = await criarClienteRapidoOS(pessoaNomeInput)
                      setCriandoCliente(false)
                      if (r.ok) { setPessoaId(r.id); setPessoaNomeInput(r.nome); setSugestoes([]) }
                      else setErroNova(r.erro)
                    }}
                    className="mt-1.5 rounded-lg border border-dashed border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition disabled:opacity-50">
                    {criandoCliente ? 'Cadastrando…' : `+ Cadastrar "${pessoaNomeInput.trim()}" como novo cliente`}
                  </button>
                )}
              </div>

              {/* Aparelho */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Aparelho</label>
                  <input name="aparelho" placeholder="Celular, Tablet, Notebook..." className="field w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Marca / Modelo</label>
                  <input name="modelo" placeholder="Samsung A54, iPhone 14..." className="field w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">IMEI / Série</label>
                  <input name="imei" placeholder="Opcional" className="field w-full" />
                </div>
              </div>

              {/* Problema */}
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">
                  Problema relatado <span className="text-red-400">*</span>
                </label>
                <textarea name="problema" required rows={3} placeholder="Descreva o problema relatado pelo cliente..."
                  className="field w-full resize-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Observações internas</label>
                <textarea name="observacoes" rows={2} placeholder="Anotações para o técnico..."
                  className="field w-full resize-none" />
              </div>

              {/* Técnico + previsão de entrega (Isa 29/07) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Técnico responsável</label>
                  <select name="tecnico_id" className="field w-full">
                    <option value="">— Eu mesmo —</option>
                    {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1.5">Previsão de entrega</label>
                  <input type="datetime-local" name="previsao_entrega" className="field w-full" />
                </div>
              </div>

              {erroNova && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erroNova}</p>}

              <div className="border-t border-gray-100 pt-4 flex gap-3">
                <button type="button" onClick={fecharNova}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={salvando}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-50">
                  {salvando ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Criando...</span> : '✓ Criar OS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gerenciar OS */}
      {osDetalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOsDetalhe(null)}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">OS #{String(osDetalhe.numero).padStart(4, '0')}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{osDetalhe.pessoa_nome ?? 'Sem cliente'}</p>
              </div>
              <button onClick={() => setOsDetalhe(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'Aparelho', valor: osDetalhe.aparelho ?? '—' },
                  { label: 'Modelo',   valor: osDetalhe.modelo ?? '—' },
                  { label: 'Técnico',  valor: osDetalhe.tecnico_nome ?? '—' },
                  { label: 'Entrada',  valor: fmtDt(osDetalhe.created_at) },
                ].map(({ label, valor }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
                    <p className="text-gray-800 mt-0.5">{valor}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Problema</p>
                <p className="text-sm text-gray-700">{osDetalhe.problema}</p>
              </div>

              {/* Valores: valor cobrado + custo → lucro (Isa 29/07) */}
              <div>
                <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Valores</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Valor cobrado</label>
                    <input type="number" step="0.01" min="0" value={valorInput} onChange={e => setValorInput(e.target.value)} className="field w-full" placeholder="0,00" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Custo (peças)</label>
                    <input type="number" step="0.01" min="0" value={custoInput} onChange={e => setCustoInput(e.target.value)} className="field w-full" placeholder="0,00" />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-gray-500">Lucro: <b className={((parseFloat(valorInput) || 0) - (parseFloat(custoInput) || 0)) >= 0 ? 'text-green-600' : 'text-red-500'}>{fmt((parseFloat(valorInput) || 0) - (parseFloat(custoInput) || 0))}</b></span>
                  <button onClick={salvarValores} disabled={salvandoValores}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
                    {salvandoValores ? 'Salvando…' : 'Salvar valores'}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Status atual</p>
                <BadgeOS status={osDetalhe.status} />
              </div>

              {PROXIMOS[osDetalhe.status].length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Alterar status</p>
                  <div className="flex flex-col gap-2">
                    {PROXIMOS[osDetalhe.status].map(({ status, label }) => (
                      <button key={status} disabled={atualizando}
                        onClick={() => mudarStatus(osDetalhe, status)}
                        className={`rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                          status === 'cancelado'
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

              {/* Check-lists desta OS (Etapa 4) */}
              <div>
                <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Check-lists</p>
                {checklistsOS.length === 0 && <p className="text-xs text-gray-400">Nenhum check-list aplicado.</p>}
                <div className="space-y-3">
                  {checklistsOS.map((cl) => {
                    const feitos = cl.itens.filter((i) => i.ok).length
                    return (
                      <div key={cl.id} className="rounded-xl border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-gray-800">{cl.nome} <span className="text-xs font-normal text-gray-400">· {feitos}/{cl.itens.length}</span></p>
                          <button onClick={() => removerChecklist(cl.id)} className="text-xs text-gray-400 hover:text-red-500 transition">remover</button>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {cl.itens.map((it, i) => (
                            <label key={i} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                              <input type="checkbox" checked={it.ok} onChange={() => toggleItemChecklist(cl, i)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                              <span className={it.ok ? 'line-through text-gray-400' : ''}>{it.texto}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {modelosChecklist.length > 0 ? (
                  <div className="mt-3 flex gap-2">
                    <select value={aplicandoModelo} onChange={(e) => setAplicandoModelo(e.target.value)} className="field flex-1 text-sm">
                      <option value="">Aplicar um check-list…</option>
                      {modelosChecklist.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                    <button onClick={aplicarChecklist} disabled={!aplicandoModelo}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">Aplicar</button>
                  </div>
                ) : (
                  <a href="/painel/os/checklists" className="mt-2 inline-block text-xs text-blue-600 hover:underline">+ Criar modelos de check-list</a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
