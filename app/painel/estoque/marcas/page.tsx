import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { SubmitButton } from '@/components/SubmitButton'
import { criarMarca, renomearMarca, excluirMarca } from './actions'

export default async function MarcasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const [{ data: marcas }, { data: produtos }] = await Promise.all([
    supabase.from('marcas').select('nome').order('nome'),
    supabase.from('produtos').select('marca'),
  ])

  const contagem: Record<string, number> = {}
  for (const p of (produtos ?? []) as { marca: string | null }[]) {
    const m = (p.marca ?? '').trim()
    if (m) contagem[m] = (contagem[m] ?? 0) + 1
  }

  const lista = (marcas ?? []) as { nome: string }[]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/estoque" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Marcas</h2>
        <Dica texto="Padronize as marcas dos produtos (Apple, Samsung, Xiaomi...). Aparecem no cadastro do produto e nos filtros. Renomear corrige em todos os produtos de uma vez." lado="baixo" />
        <span className="ml-auto text-sm text-gray-400">{lista.length} marcas</span>
      </div>

      {params.ok && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Marcas atualizadas.</div>
      )}
      {params.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{params.erro}</div>
      )}

      {/* Nova marca */}
      <form action={criarMarca} className="flex gap-2 max-w-md">
        <input name="nome" placeholder="Nova marca (ex: Apple)" className="field flex-1" autoComplete="off" required />
        <SubmitButton pendingText="Adicionando…" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition whitespace-nowrap disabled:opacity-60">
          + Adicionar
        </SubmitButton>
      </form>

      {/* Lista */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Marca</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Produtos</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lista.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma marca cadastrada.</td></tr>
            ) : (
              lista.map((m) => {
                const n = contagem[m.nome] ?? 0
                return (
                  <tr key={m.nome} className="hover:bg-blue-50/60 transition">
                    <td className="px-4 py-2.5">
                      <form action={renomearMarca} className="flex items-center gap-2">
                        <input type="hidden" name="nome_antigo" value={m.nome} />
                        <input name="nome_novo" defaultValue={m.nome}
                          className="rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-gray-800 hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:outline-none transition" />
                        <button type="submit" className="text-xs text-blue-500 hover:text-blue-700 opacity-70 hover:opacity-100 transition">salvar</button>
                      </form>
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm text-gray-500">{n}</td>
                    <td className="px-4 py-2.5 text-right">
                      <form action={excluirMarca}>
                        <input type="hidden" name="nome" value={m.nome} />
                        <button type="submit"
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 transition">
                          Excluir
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">Excluir uma marca não altera os produtos que já a usam — só a remove da lista de escolha.</p>
    </div>
  )
}
