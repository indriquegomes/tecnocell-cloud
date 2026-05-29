import { createServiceClient } from '@/lib/supabase/server'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { deletarPedido } from './actions'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', aguardando: 'Aguardando', aprovado: 'Aprovado',
  cancelado: 'Cancelado', entregue: 'Entregue',
}
const STATUS_COLOR: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-600',
  aguardando: 'bg-yellow-100 text-yellow-700',
  aprovado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-600',
  entregue: 'bg-blue-100 text-blue-700',
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; status?: string }>
}) {
  const { tipo, status } = await searchParams
  const supabase = await createServiceClient()

  let query = supabase
    .from('pedidos')
    .select('id, numero, tipo, status, total, data_validade, created_at, pessoas(nome)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (tipo) query = query.eq('tipo', tipo)
  if (status) query = query.eq('status', status)

  const { data: pedidos } = await query

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Pedidos e Orçamentos</h2>
        <Link href="/painel/pedidos/novo"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          + Novo
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {[['', 'Todos'], ['orcamento', 'Orçamentos'], ['pedido', 'Pedidos']].map(([v, l]) => (
          <Link key={v} href={`/painel/pedidos${v ? `?tipo=${v}` : ''}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition ${tipo === v || (!tipo && !v) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {l}
          </Link>
        ))}
        <span className="ml-auto self-center text-sm text-gray-400">{pedidos?.length ?? 0} registros</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Total</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(pedidos ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                Nenhum registro. <Link href="/painel/pedidos/novo" className="text-blue-500 hover:underline">Criar</Link>.
              </td></tr>
            ) : (pedidos ?? []).map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm font-mono text-gray-500">#{p.numero}</td>
                <td className="px-4 py-3 text-sm text-gray-600 capitalize">{p.tipo}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">
                  {(p.pessoas as unknown as { nome: string } | null)?.nome ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                  {Number(p.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/pedidos/${p.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                      Abrir
                    </Link>
                    <BotaoExcluir action={deletarPedido.bind(null, p.id)} mensagem="Excluir este pedido/orçamento?" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
