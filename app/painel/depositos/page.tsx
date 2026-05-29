import { createServiceClient } from '@/lib/supabase/server'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { criarDeposito, editarDeposito, deletarDeposito } from './actions'
import Link from 'next/link'

export default async function DepositosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; editar?: string }>
}) {
  const { erro, editar } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: depositos }, { data: estoque }] = await Promise.all([
    supabase.from('depositos').select('id, nome, descricao').order('nome'),
    supabase.from('estoque').select('deposito_id, quantidade'),
  ])

  const editando = depositos?.find((d) => d.id === editar)

  const totalPorDeposito = (depositos ?? []).map((d) => ({
    ...d,
    total: (estoque ?? [])
      .filter((e) => e.deposito_id === d.id)
      .reduce((s, e) => s + (e.quantidade ?? 0), 0),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Depósitos</h2>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">
          {editando ? `Editando: ${editando.nome}` : 'Novo Depósito'}
        </h3>
        <form action={editando ? editarDeposito.bind(null, editando.id) : criarDeposito}
          className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Nome *</label>
            <input name="nome" required defaultValue={editando?.nome ?? ''} className="field" placeholder="Ex: Loja Principal" />
          </div>
          <div className="flex-1 min-w-48">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Descrição</label>
            <input name="descricao" defaultValue={editando?.descricao ?? ''} className="field" placeholder="Opcional" />
          </div>
          <button type="submit"
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            {editando ? 'Salvar' : 'Adicionar'}
          </button>
          {editando && (
            <Link href="/painel/depositos"
              className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              Cancelar
            </Link>
          )}
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Depósito</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Descrição</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Itens em Estoque</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {totalPorDeposito.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum depósito cadastrado.</td></tr>
            ) : totalPorDeposito.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{d.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{d.descricao || '—'}</td>
                <td className="px-4 py-3 text-center text-sm font-semibold text-gray-700">{d.total}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/depositos?editar=${d.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                      Editar
                    </Link>
                    <BotaoExcluir action={deletarDeposito.bind(null, d.id)} mensagem="Excluir este depósito?" />
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
