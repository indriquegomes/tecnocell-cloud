import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { IconTag } from '@/components/icons'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { criarCategoria, editarCategoria, deletarCategoria } from './actions'
import { SubmitButton } from '@/components/SubmitButton'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; editar?: string; busca?: string; ordem?: string; dir?: string }>
}) {
  const { erro, editar, busca, ordem, dir } = await searchParams
  const supabase = await createServiceClient()

  // fetchAll porque o PostgREST corta em 1000 linhas: com 8 mil produtos, o select
  // cru trazia só os 1000 primeiros e a contagem por categoria saía absurda —
  // uma categoria com 1.157 produtos aparecia com 11.
  const [{ data: categorias }, produtos] = await Promise.all([
    supabase.from('categorias').select('hierarquia, nome, descricao').order('nome'),
    fetchAll<{ categoria: string | null }>((from, to) =>
      supabase.from('produtos').select('categoria').range(from, to)),
  ])

  const editando = categorias?.find((c) => c.hierarquia === editar)

  const comContagem = (categorias ?? []).map((c) => ({
    ...c,
    total: produtos.filter((p) => p.categoria === c.hierarquia).length,
  }))

  const ordemAtual = ordem ?? 'nome'
  const ordemDir = dir === 'desc'
  const baseParamsCat: Record<string, string> = {}
  if (busca) baseParamsCat.busca = busca
  const sortLinkCat = (o: string) => {
    const ativo = ordemAtual === o
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'asc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParamsCat, ordem: o, ...(nextDir === 'desc' ? { dir: 'desc' } : {}) }).toString()
    return { href: `/painel/categorias?${qs}`, arrow, ativo }
  }

  let filtradas = busca
    ? comContagem.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()))
    : comContagem

  filtradas = [...filtradas].sort((a, b) => {
    const va = ordemAtual === 'total' ? a.total : a.nome.toLowerCase()
    const vb = ordemAtual === 'total' ? b.total : b.nome.toLowerCase()
    if (va < vb) return ordemDir ? 1 : -1
    if (va > vb) return ordemDir ? -1 : 1
    return 0
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconTag className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Categorias de Produtos</h2>
          <Dica texto="Agrupe produtos por tipo (ex: Baterias, Telas, Carregadores). Facilita filtros e organização no catálogo." />
        </div>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">
          {editando ? `Editando: ${editando.nome}` : 'Nova Categoria'}
        </h3>
        <form action={editando ? editarCategoria.bind(null, editando.hierarquia) : criarCategoria}
          className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Nome *</label>
            <input name="nome" required defaultValue={editando?.nome ?? ''} className="field" placeholder="Ex: Smartphones" />
          </div>
          <div className="flex-1 min-w-48">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Descrição</label>
            <input name="descricao" defaultValue={editando?.descricao ?? ''} className="field" placeholder="Opcional" />
          </div>
          <SubmitButton pendingText={editando ? 'Salvando...' : 'Adicionando...'}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
            {editando ? 'Salvar' : 'Adicionar'}
          </SubmitButton>
          {editando && (
            <Link href="/painel/categorias"
              className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              Cancelar
            </Link>
          )}
        </form>
      </div>

      {/* Busca */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="busca"
          defaultValue={busca}
          placeholder="Buscar categoria..."
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Filtrar
        </button>
        {busca && (
          <Link href="/painel/categorias" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
            Limpar
          </Link>
        )}
        <span className="ml-auto self-center text-sm text-gray-400">{filtradas.length} categorias</span>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[{ o: 'nome', l: 'Categoria', a: 'text-left' }, { o: 'total', l: 'Produtos', a: 'text-center' }].map(({ o, l, a }) => {
                const s = sortLinkCat(o)
                return <th key={o} className={`px-4 py-3 ${a} text-xs font-semibold text-gray-500 uppercase`}>
                  <Link href={s.href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${s.ativo ? 'text-blue-600' : ''}`}>{l} <span className="text-gray-400">{s.arrow}</span></Link>
                </th>
              })}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Descrição</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtradas.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma categoria encontrada.</td></tr>
            ) : filtradas.map((c) => (
              <tr key={c.hierarquia} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.nome}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">{c.total}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{c.descricao || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/categorias?editar=${encodeURIComponent(c.hierarquia)}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                      Editar
                    </Link>
                    <BotaoExcluir action={deletarCategoria.bind(null, c.hierarquia)} mensagem={`Excluir categoria "${c.nome}"?`} />
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
