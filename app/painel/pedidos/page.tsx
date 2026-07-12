import { createServiceClient } from '@/lib/supabase/server'
import { IconPlus } from '@/components/icons'
import { deletarPedido } from './actions'
import { ConfirmButton } from '@/components/ConfirmButton'
import Link from 'next/link'
import { PedidosFiltros } from './PedidosFiltros'
import { Dica } from '@/components/Dica'

const STATUS_SISTEMA: Record<string, string> = {
  rascunho:  'Rascunho',
  aprovado:  'Aprovado — Aguardando Faturamento',
  faturado:  'Faturado',
  cancelado: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  rascunho:  'text-gray-400',
  aprovado:  'text-yellow-600 font-medium',
  faturado:  'text-green-600 font-medium',
  cancelado: 'text-red-500',
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = (d: string) =>
  new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; status?: string; q?: string; ordem?: string; dir?: string }>
}) {
  const { tipo, status, q, ordem, dir } = await searchParams
  const supabase = await createServiceClient()

  const ordemAtual = ordem ?? 'created_at'
  const ordemDir = dir === 'desc'
  const camposDB: Record<string, string> = { created_at: 'created_at', numero: 'numero', tipo: 'tipo', status: 'status', total: 'total' }
  const baseParams: Record<string, string> = {}
  if (tipo)   baseParams.tipo   = tipo
  if (status) baseParams.status = status
  if (q)      baseParams.q      = q
  const sortLink = (o: string) => {
    const ativo = ordemAtual === o
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'desc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParams, ordem: o, ...(nextDir === 'asc' ? { dir: 'asc' } : {}) }).toString()
    return { href: `/painel/pedidos?${qs}`, arrow, ativo }
  }

  let query = supabase
    .from('pedidos')
    .select('id, numero, tipo, status, total, created_at, pessoas(nome)')
    .order(camposDB[ordemAtual] ?? 'created_at', { ascending: !ordemDir })
    .limit(200)

  if (tipo) query = query.eq('tipo', tipo)
  if (status) query = query.eq('status', status)

  const { data: pedidos } = await query

  const busca = q?.toLowerCase().trim() ?? ''
  const lista = (pedidos ?? []).filter((p) => {
    if (!busca) return true
    const cliente = (p.pessoas as unknown as { nome: string } | null)?.nome?.toLowerCase() ?? ''
    const num = String(p.numero ?? '')
    return cliente.includes(busca) || num.includes(busca)
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">Pedidos e Orçamentos</h2>
          <Dica texto="Crie orçamentos para clientes ou registre pedidos. Pedidos aprovados podem ser faturados no PDV." />
        </div>
        <Link href="/painel/pedidos/novo"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
          <IconPlus className="h-4 w-4" /> Novo
        </Link>
      </div>

      {/* Filtros + busca */}
      <PedidosFiltros
        tipo={tipo ?? ''}
        status={status ?? ''}
        q={q ?? ''}
        total={lista.length}
      />

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[
                { o: 'numero',     l: 'Código',          a: 'text-left' },
                { o: 'created_at', l: 'Data',            a: 'text-left' },
                { o: 'tipo',       l: 'Tipo',            a: 'text-left' },
                { o: 'status',     l: 'Status',          a: 'text-left' },
                { o: 'total',      l: 'Valor',           a: 'text-right' },
              ].map(({ o, l, a }) => {
                const s = sortLink(o)
                return <th key={o} className={`px-4 py-3 ${a} text-xs font-semibold text-gray-500 uppercase`}>
                  <Link href={s.href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${s.ativo ? 'text-blue-600' : ''}`}>{l} <span className="text-gray-400">{s.arrow}</span></Link>
                </th>
              })}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lista.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum registro.{' '}
                  <Link href="/painel/pedidos/novo" className="text-blue-500 hover:underline">Criar novo</Link>.
                </td>
              </tr>
            ) : lista.map((p) => {
              const cliente = (p.pessoas as unknown as { nome: string } | null)?.nome
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-sm font-mono text-gray-500">#{p.numero ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDt(p.created_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${p.tipo === 'orcamento' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                      {p.tipo === 'orcamento' ? 'Orçamento' : 'Pedido'}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-sm ${STATUS_COLOR[p.status] ?? 'text-gray-500'}`}>
                    {STATUS_SISTEMA[p.status] ?? p.status}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{cliente ?? '—'}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(p.total ?? 0)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Link href={`/painel/pedidos/${p.id}`}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                        Abrir
                      </Link>
                      <form action={deletarPedido.bind(null, p.id)}>
                        <ConfirmButton message="Excluir este pedido/orçamento?"
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-50 transition">
                          Excluir
                        </ConfirmButton>
                      </form>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
