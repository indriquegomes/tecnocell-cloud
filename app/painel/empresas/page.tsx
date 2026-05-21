import { createClient } from '@/lib/supabase/server'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { deletarEmpresa } from './actions'
import Link from 'next/link'

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; busca?: string }>
}) {
  const { erro, busca } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('empresas').select('id, nome, cnpj, telefone, email, cidade, estado, ativa').order('nome')
  if (busca) query = query.ilike('nome', `%${busca}%`)
  const { data: empresas } = await query

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Empresas</h2>
        <Link href="/painel/empresas/nova"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          + Nova Empresa
        </Link>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      <form method="GET" className="flex gap-3">
        <input name="busca" defaultValue={busca} placeholder="Buscar por nome..."
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="ml-auto self-center text-sm text-gray-400">{empresas?.length ?? 0} registros</span>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Nome</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">CNPJ</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Contato</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cidade</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(empresas ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                Nenhuma empresa. <Link href="/painel/empresas/nova" className="text-blue-500 hover:underline">Cadastrar</Link>.
              </td></tr>
            ) : (empresas ?? []).map((e) => (
              <tr key={e.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{e.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{e.cnpj || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {e.email && <p>{e.email}</p>}
                  {e.telefone && <p>{e.telefone}</p>}
                  {!e.email && !e.telefone && '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {e.cidade ? `${e.cidade}${e.estado ? `/${e.estado}` : ''}` : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${e.ativa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {e.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/empresas/${e.id}/editar`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                      Editar
                    </Link>
                    <BotaoExcluir action={deletarEmpresa.bind(null, e.id)} mensagem="Excluir esta empresa?" />
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
