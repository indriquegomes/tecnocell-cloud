import { createServiceClient } from '@/lib/supabase/server'
import { deletarPedido } from './actions'
import { ConfirmButton } from '@/components/ConfirmButton'
import Link from 'next/link'

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
  new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; status?: string; q?: string }>
}) {
  const { tipo, status, q } = await searchParams
  const supabase = await createServiceClient()

  let query = supabase
    .from('pedidos')
    .select('id, numero, tipo, status, total, created_at, pessoas(nome)')
    .order('created_at', { ascending: false })
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
        <h2 className="text-2xl font-bold text-gray-900">Pedidos e Orçamentos</h2>
        <Link href="/painel/pedidos/novo"
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
          + Novo
        </Link>
      </div>

      {/* Filtros + busca */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Tipo */}
        {([['', 'Todos'], ['orcamento', 'Orçamentos'], ['pedido', 'Pedidos']] as [string, string][]).map(([v, l]) => (
          <Link key={v}
            href={`/painel/pedidos?${new URLSearchParams({ ...(v ? { tipo: v } : {}), ...(status ? { status } : {}), ...(q ? { q } : {}) }).toString()}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition ${(tipo ?? '') === v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {l}
          </Link>
        ))}

        {/* Status */}
        <select
          defaultValue={status ?? ''}
          onChange={(e) => {
            const url = new URL(window.location.href)
            if (e.target.value) url.searchParams.set('status', e.target.value)
            else url.searchParams.delete('status')
            window.location.href = url.toString()
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="aprovado">Aprovado</option>
          <option value="faturado">Faturado</option>
          <option value="cancelado">Cancelado</option>
        </select>

        {/* Busca */}
        <form className="ml-auto flex gap-2">
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q ?? ''} placeholder="Buscar por cliente ou nº..."
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 w-56" />
          <button type="submit"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition">
            Buscar
          </button>
        </form>

        <span className="text-xs text-gray-400">{lista.length} registros</span>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Código</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status do Sistema</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Valor</th>
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
