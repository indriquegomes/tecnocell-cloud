import { createServiceClient } from '@/lib/supabase/server'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { criarMarca, editarMarca, deletarMarca } from './actions'
import { Dica } from '@/components/Dica'
import Link from 'next/link'

type Marca = { id: string; nome: string; ativa: boolean }

export default async function MarcasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; editar?: string }>
}) {
  const { erro, editar } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: marcasData }, { data: produtos }] = await Promise.all([
    supabase.from('marcas').select('id, nome, ativa').order('nome'),
    supabase.from('produtos').select('marca'),
  ])
  const marcas = (marcasData ?? []) as Marca[]

  const contagem: Record<string, number> = {}
  for (const p of (produtos ?? []) as { marca: string | null }[]) {
    if (p.marca) contagem[p.marca] = (contagem[p.marca] ?? 0) + 1
  }

  const editando = editar ? marcas.find((m) => m.id === editar) : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">Marcas</h2>
        <Dica texto="Fabricantes/marcas dos produtos (Apple, Samsung...). Vira registro pra padronizar e filtrar. Renomear aqui atualiza os produtos junto." />
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">{editando ? `Editando: ${editando.nome}` : 'Nova Marca'}</h3>
        <form action={editando ? editarMarca.bind(null, editando.id) : criarMarca} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Nome *</label>
            <input name="nome" required defaultValue={editando?.nome ?? ''} className="field" placeholder="Ex: Apple, Samsung, Motorola" />
          </div>
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            {editando ? 'Salvar' : 'Adicionar'}
          </button>
          {editando && (
            <Link href="/painel/marcas" className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancelar</Link>
          )}
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Marca</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Produtos</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {marcas.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma marca.</td></tr>
            ) : marcas.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{m.nome}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">{contagem[m.nome] ?? 0}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/marcas?editar=${m.id}`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">Editar</Link>
                    <BotaoExcluir action={deletarMarca.bind(null, m.id)} mensagem={`Excluir a marca "${m.nome}"?`} />
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
