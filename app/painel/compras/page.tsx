import { createClient } from '@/lib/supabase/server'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { deletarNota } from './actions'
import Link from 'next/link'

const STATUS_COLOR: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-700',
  recebida: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-600',
}

export default async function ComprasPage() {
  const supabase = await createClient()
  const { data: notas } = await supabase
    .from('notas_entrada')
    .select('id, numero, status, valor_total, data_entrada, data_emissao, pessoas(nome)')
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Notas de Entrada</h2>
        <Link href="/painel/compras/nova"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          + Nova Nota
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Número</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fornecedor</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Entrada</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Total</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(notas ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                Nenhuma nota. <Link href="/painel/compras/nova" className="text-blue-500 hover:underline">Cadastrar</Link>.
              </td></tr>
            ) : (notas ?? []).map((n) => (
              <tr key={n.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm font-mono text-gray-600">{n.numero || '—'}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">
                  {(n.pessoas as unknown as { nome: string } | null)?.nome ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {n.data_entrada ? new Date(n.data_entrada + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                  {Number(n.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[n.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {n.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/compras/${n.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                      Abrir
                    </Link>
                    <BotaoExcluir action={deletarNota.bind(null, n.id)} mensagem="Excluir esta nota de entrada?" />
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
