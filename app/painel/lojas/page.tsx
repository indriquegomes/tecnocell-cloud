import { createServiceClient } from '@/lib/supabase/server'
import { IconPlus, IconStore } from '@/components/icons'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { deletarLoja } from './actions'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

export default async function LojasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: lojas }, { data: deps }] = await Promise.all([
    supabase.from('lojas').select('id, nome, cnpj, telefone, cidade, uf, ativa').order('nome'),
    supabase.from('depositos').select('id, loja_id'),
  ])

  const nDeps: Record<string, number> = {}
  for (const d of (deps ?? []) as { loja_id: string | null }[]) {
    if (d.loja_id) nDeps[d.loja_id] = (nDeps[d.loja_id] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Lojas</h2>
          <Dica texto="As unidades da sua rede (ex: Teresópolis, Petrópolis). Cada loja agrupa seus próprios depósitos. Não confundir com Empresas (fornecedores)." />
        </div>
        <Link href="/painel/lojas/nova"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          <IconPlus className="h-4 w-4" /> Nova Loja
        </Link>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Loja</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cidade</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Depósitos</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">CNPJ</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Telefone</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(lojas ?? []).length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                Nenhuma loja. <Link href="/painel/lojas/nova" className="text-blue-500 hover:underline">Cadastrar</Link>.
              </td></tr>
            ) : (lojas ?? []).map((l) => (
              <tr key={l.id} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{l.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.cidade ? `${l.cidade}${l.uf ? `/${l.uf}` : ''}` : '—'}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">{nDeps[l.id] ?? 0}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.cnpj || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.telefone || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${l.ativa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {l.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/lojas/${l.id}/editar`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                      Editar
                    </Link>
                    <BotaoExcluir action={deletarLoja.bind(null, l.id)} mensagem="Excluir esta loja?" />
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
