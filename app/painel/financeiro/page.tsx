import { createServiceClient } from '@/lib/supabase/server'
import { IconWallet } from '@/components/icons'
import { formatBRL, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { BuscaLista } from '@/components/BuscaLista'
import { marcarPago, deletarLancamento } from './actions'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; busca?: string; ordem?: string; dir?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const ordemAtual = params.ordem ?? 'data_vencimento'
  const ordemDir = params.dir === 'desc'
  const camposDB: Record<string, string> = { data_vencimento: 'data_vencimento', valor: 'valor', descricao: 'descricao', pessoa_nome: 'pessoa_nome', tipo: 'tipo', status: 'status' }
  const baseParams: Record<string, string> = {}
  if (params.tipo)  baseParams.tipo  = params.tipo
  if (params.busca) baseParams.busca = params.busca
  const sortLink = (o: string) => {
    const ativo = ordemAtual === o
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'asc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParams, ordem: o, ...(nextDir === 'desc' ? { dir: 'desc' } : {}) }).toString()
    return { href: `/painel/financeiro?${qs}`, arrow, ativo }
  }

  let query = supabase
    .from('lancamentos')
    .select('id, codigo, descricao, valor, tipo, status, data_vencimento, data_pagamento, forma_pagamento, pessoa_nome')
    .order(camposDB[ordemAtual] ?? 'data_vencimento', { ascending: !ordemDir })
    .limit(200)

  if (params.tipo && (params.tipo === 'pagar' || params.tipo === 'receber')) {
    query = query.eq('tipo', params.tipo)
  }
  if (params.busca) {
    // multi-palavra: cada palavra tem que aparecer na descrição OU no nome da pessoa
    const palavras = params.busca.replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
    for (const w of palavras) query = query.or(`descricao.ilike.%${w}%,pessoa_nome.ilike.%${w}%`)
  }

  const { data: lancamentos } = await query

  const todos = lancamentos ?? []
  const totalReceber = todos.filter((l) => l.tipo === 'receber' && l.status !== 'pago').reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalPagar = todos.filter((l) => l.tipo === 'pagar' && l.status !== 'pago').reduce((s, l) => s + (l.valor ?? 0), 0)
  const pendentes = todos.filter((l) => (l.status ?? '').toLowerCase() !== 'pago').length

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

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
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
