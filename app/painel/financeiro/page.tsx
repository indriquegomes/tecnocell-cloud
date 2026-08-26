import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { FinanceiroTabs } from './FinanceiroTabs'
import { IconWallet } from '@/components/icons'
import { formatBRL, formatDate, hojeSP } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { BuscaLista } from '@/components/BuscaLista'
import { marcarPago, deletarLancamento } from './actions'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { ExportCsv } from '../relatorios/ExportCsv'
import { BuscaAvancada } from '@/components/BuscaAvancada'

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; busca?: string; ordem?: string; dir?: string; status?: string; de?: string; ate?: string; pessoa?: string; forma?: string; conta?: string; categoria?: string; valor_min?: string; valor_max?: string; campo?: string; erro?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  // Campo de data pelo qual filtrar o período (Busca Avançada, igual SIGE:
  // Vencimento × Competência × Pagamento). Default vencimento.
  const camposData = ['data_vencimento', 'data_competencia', 'data_pagamento']
  const campoData = camposData.includes(params.campo ?? '') ? params.campo! : 'data_vencimento'

  // Dropdowns da busca avançada
  const [{ data: formasList }, { data: contasList }, { data: catsRaw }] = await Promise.all([
    supabase.from('formas_pagamento').select('nome').order('nome'),
    supabase.from('contas').select('id, nome').eq('ativa', true).order('nome'),
    supabase.from('lancamentos').select('categoria').not('categoria', 'is', null).limit(2000),
  ])
  const formasOpc = [...new Set((formasList ?? []).map((f) => f.nome as string))]
  const contasOpc = (contasList ?? []) as { id: string; nome: string }[]
  const categoriasOpc = [...new Set((catsRaw ?? []).map((c) => c.categoria as string).filter(Boolean))].sort()

  // Aplica TODOS os filtros da busca avançada a uma query (reusado na lista e nos totais)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const aplica = (q: any): any => {
    if (params.tipo === 'pagar' || params.tipo === 'receber') q = q.eq('tipo', params.tipo)
    if (params.busca) { for (const w of params.busca.replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)) q = q.or(`descricao.ilike.%${w}%,pessoa_nome.ilike.%${w}%`) }
    if (params.pessoa) q = q.ilike('pessoa_nome', `%${params.pessoa}%`)
    if (params.forma) q = q.eq('forma_pagamento', params.forma)
    if (params.conta) q = q.eq('conta_id', params.conta)
    if (params.categoria) q = q.eq('categoria', params.categoria)
    if (params.valor_min) q = q.gte('valor', Number(params.valor_min))
    if (params.valor_max) q = q.lte('valor', Number(params.valor_max))
    if (params.status === 'pago') q = q.eq('status', 'pago')
    else if (params.status === 'pendente') q = q.neq('status', 'pago')
    else if (params.status === 'vencido') q = q.neq('status', 'pago').lt('data_vencimento', hojeSP())
    if (params.de) q = q.gte(campoData, params.de)
    if (params.ate) q = q.lte(campoData, params.ate)
    return q
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const temFiltro = !!(params.busca || params.pessoa || params.forma || params.conta || params.categoria || params.valor_min || params.valor_max || params.status || params.de || params.ate || params.tipo)

  const ordemAtual = params.ordem ?? 'data_vencimento'
  const ordemDir = params.dir === 'desc'
  const camposDB: Record<string, string> = { data_vencimento: 'data_vencimento', valor: 'valor', descricao: 'descricao', pessoa_nome: 'pessoa_nome', tipo: 'tipo', status: 'status' }
  const baseParams: Record<string, string> = {}
  for (const k of ['tipo', 'busca', 'status', 'de', 'ate', 'pessoa', 'forma', 'conta', 'categoria', 'valor_min', 'valor_max', 'campo'] as const) {
    if (params[k]) baseParams[k] = params[k]!
  }
  const sortLink = (o: string) => {
    const ativo = ordemAtual === o
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'asc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParams, ordem: o, ...(nextDir === 'desc' ? { dir: 'desc' } : {}) }).toString()
    return { href: `/painel/financeiro?${qs}`, arrow, ativo }
  }

  const listaQuery = supabase
    .from('lancamentos')
    .select('id, codigo, descricao, valor, tipo, status, data_vencimento, data_pagamento, data_competencia, forma_pagamento, pessoa_nome, categoria')
    .order(camposDB[ordemAtual] ?? 'data_vencimento', { ascending: !ordemDir })
    .limit(200)
  const { data: lancamentos } = await aplica(listaQuery)

  type LancRow = { id: string; codigo: string | null; descricao: string | null; valor: number | null; tipo: string; status: string | null; data_vencimento: string | null; data_pagamento: string | null; data_competencia: string | null; forma_pagamento: string | null; pessoa_nome: string | null; categoria: string | null }
  const todos = (lancamentos ?? []) as LancRow[]

  // ✨ Totais DO FILTRO (não só os globais): soma exatamente o que está filtrado,
  // sem o cap de 200 da lista. Isa: "quanto tenho a receber em PIX vencendo em agosto".
  const filtrados = await fetchAll<{ valor: number | null; tipo: string; status: string | null }>(
    (from, to) => aplica(supabase.from('lancamentos').select('valor, tipo, status')).range(from, to)
  )
  const fReceber = filtrados.filter((l) => l.tipo === 'receber').reduce((s, l) => s + (l.valor ?? 0), 0)
  const fPagar = filtrados.filter((l) => l.tipo === 'pagar').reduce((s, l) => s + (l.valor ?? 0), 0)
  const fCount = filtrados.length
  const inp = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
  const labelCampo: Record<string, string> = { data_vencimento: 'Vencimento', data_competencia: 'Competência', data_pagamento: 'Pagamento' }
  // Cards de resumo somam TODOS os pendentes (globais), sem o cap de 200 da lista
  // nem o filtro de busca/tipo — senão os totais subcontam quando houver >200 lançamentos.
  const paraTotais = await fetchAll<{ valor: number | null; tipo: string; status: string | null }>(
    (from, to) => supabase.from('lancamentos').select('valor, tipo, status').range(from, to)
  )
  const totalReceber = paraTotais.filter((l) => l.tipo === 'receber' && l.status !== 'pago').reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalPagar = paraTotais.filter((l) => l.tipo === 'pagar' && l.status !== 'pago').reduce((s, l) => s + (l.valor ?? 0), 0)
  const pendentes = paraTotais.filter((l) => (l.status ?? '').toLowerCase() !== 'pago').length


  function statusVariant(status: string | null): 'success' | 'warning' | 'danger' | 'outline' {
    const s = (status ?? '').toLowerCase()
    if (s.includes('pago') || s.includes('recebido')) return 'success'
    if (s.includes('vencido') || s.includes('atrasado')) return 'danger'
    if (s.includes('parcial')) return 'warning'
    return 'outline'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconWallet className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Financeiro</h2>
          <Dica texto="Controle de contas a pagar e a receber. Registre despesas, receitas e acompanhe o saldo pendente." />
        </div>
        <div className="flex gap-2">
          <Link href="/painel/financeiro/novo?tipo=receber"
            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition">
            + A Receber
          </Link>
          <Link href="/painel/financeiro/novo?tipo=pagar"
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition">
            + A Pagar
          </Link>
        </div>
      </div>

      {params.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{params.erro}</div>
      )}

      <FinanceiroTabs active="lancamentos" />

      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-green-700">A Receber (pendente)</p>
          <p className="mt-1 text-3xl font-bold text-green-700">{formatBRL(totalReceber)}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-700">A Pagar (pendente)</p>
          <p className="mt-1 text-3xl font-bold text-red-700">{formatBRL(totalPagar)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Pendentes</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{pendentes}</p>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap gap-3">
        {params.busca && <input type="hidden" name="busca" value={params.busca} />}
        <BuscaLista basePath="/painel/financeiro" placeholder="Buscar por descrição ou cliente..." />
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <Link href="/painel/financeiro"
            className={`px-4 py-2 transition ${!params.tipo ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Todos
          </Link>
          <Link href="/painel/financeiro?tipo=receber"
            className={`px-4 py-2 border-l border-gray-200 transition ${params.tipo === 'receber' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            A Receber
          </Link>
          <Link href="/painel/financeiro?tipo=pagar"
            className={`px-4 py-2 border-l border-gray-200 transition ${params.tipo === 'pagar' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            A Pagar
          </Link>
        </div>
      </form>

      {/* 🔎 Busca Avançada (Isa 29/07 — espelha a do SIGE) */}
      <BuscaAvancada ativo={temFiltro}>
        <form method="GET" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {params.tipo && <input type="hidden" name="tipo" value={params.tipo} />}
          {params.busca && <input type="hidden" name="busca" value={params.busca} />}
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Cliente / Fornecedor</label>
            <input name="pessoa" defaultValue={params.pessoa ?? ''} placeholder="nome…" className={inp} /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Forma de pagamento</label>
            <select name="forma" defaultValue={params.forma ?? ''} className={inp}>
              <option value="">Todas</option>{formasOpc.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Conta</label>
            <select name="conta" defaultValue={params.conta ?? ''} className={inp}>
              <option value="">Todas</option>{contasOpc.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Categoria</label>
            <select name="categoria" defaultValue={params.categoria ?? ''} className={inp}>
              <option value="">Todas</option>{categoriasOpc.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Situação</label>
            <select name="status" defaultValue={params.status ?? ''} className={inp}>
              <option value="">Todos</option><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="vencido">Vencido</option></select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Valor de</label>
            <input name="valor_min" type="number" step="0.01" defaultValue={params.valor_min ?? ''} placeholder="0,00" className={inp} /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Valor até</label>
            <input name="valor_max" type="number" step="0.01" defaultValue={params.valor_max ?? ''} placeholder="0,00" className={inp} /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Filtrar período por</label>
            <select name="campo" defaultValue={campoData} className={inp}>
              {camposData.map((c) => <option key={c} value={c}>{labelCampo[c]}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">De</label>
            <input name="de" type="date" defaultValue={params.de ?? ''} className={inp} /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Até</label>
            <input name="ate" type="date" defaultValue={params.ate ?? ''} className={inp} /></div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">Filtrar</button>
            {temFiltro && <Link href="/painel/financeiro" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition">Limpar tudo</Link>}
          </div>
        </form>
      </BuscaAvancada>

      {/* ✨ Totais do que está filtrado (não só o global) + exportar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gray-100 bg-gray-50/60 px-5 py-3 text-sm">
        <span className="font-semibold text-gray-500">No filtro atual:</span>
        <span>A Receber <b className="text-green-600">{formatBRL(fReceber)}</b></span>
        <span>A Pagar <b className="text-red-500">{formatBRL(fPagar)}</b></span>
        <span>Saldo <b className={fReceber - fPagar >= 0 ? 'text-gray-800' : 'text-red-500'}>{formatBRL(fReceber - fPagar)}</b></span>
        <span className="text-gray-400">{fCount} lançamento(s)</span>
        <div className="ml-auto">
          <ExportCsv filename={`financeiro_${hojeSP()}.csv`}
            cols={[{ key: 'descricao', label: 'Descrição' }, { key: 'pessoa_nome', label: 'Pessoa' }, { key: 'data_vencimento', label: 'Vencimento' }, { key: 'data_competencia', label: 'Competência' }, { key: 'valor', label: 'Valor', money: true }, { key: 'tipo', label: 'Tipo' }, { key: 'status', label: 'Status' }, { key: 'forma_pagamento', label: 'Forma' }, { key: 'categoria', label: 'Categoria' }]}
            rows={todos as unknown as Record<string, unknown>[]} />
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[
                { o: 'descricao',      l: 'Descrição',  a: 'text-left' },
                { o: 'pessoa_nome',    l: 'Pessoa',     a: 'text-left' },
                { o: 'data_vencimento', l: 'Vencimento', a: 'text-left' },
                { o: 'valor',          l: 'Valor',      a: 'text-right' },
                { o: 'tipo',           l: 'Tipo',       a: 'text-center' },
                { o: 'status',         l: 'Status',     a: 'text-center' },
              ].map(({ o, l, a }) => {
                const s = sortLink(o)
                return <th key={o} className={`px-4 py-3 ${a} text-xs font-semibold text-gray-500 uppercase tracking-wide`}>
                  <Link href={s.href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${s.ativo ? 'text-blue-600' : ''}`}>{l} <span className="text-gray-400">{s.arrow}</span></Link>
                </th>
              })}
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {todos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum lançamento encontrado.
                </td>
              </tr>
            ) : (
              todos.map((l) => {
                const pago = (l.status ?? '').toLowerCase().includes('pago')
                return (
                  <tr key={l.id} className="hover:bg-blue-50/60 transition">
                    <td className="px-4 py-3 text-sm text-gray-800">{l.descricao || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{l.pessoa_nome || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {l.data_vencimento ? formatDate(l.data_vencimento) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-bold ${l.tipo === 'receber' ? 'text-green-600' : 'text-red-600'}`}>
                      {l.tipo === 'receber' ? '+' : '-'}{formatBRL(l.valor ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={l.tipo === 'receber' ? 'success' : 'danger'}>
                        {l.tipo === 'receber' ? 'Receber' : 'Pagar'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={statusVariant(l.status)}>{l.status || 'Pendente'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {!pago && (
                          <form action={marcarPago.bind(null, l.id)}>
                            <button type="submit" className="rounded-lg px-2.5 py-1 text-xs font-medium text-green-600 hover:bg-green-50 transition">
                              Pago
                            </button>
                          </form>
                        )}
                        <Link href={`/painel/financeiro/${l.id}/editar`}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                          Editar
                        </Link>
                        <BotaoExcluir action={deletarLancamento.bind(null, l.id)} mensagem="Excluir este lançamento?" />
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
