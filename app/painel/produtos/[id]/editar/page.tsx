import { createClient } from '@/lib/supabase/server'
import { editarProduto } from '../../actions'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: produto }, { data: categorias }, { data: marcas }] = await Promise.all([
    supabase.from('produtos').select('*').eq('id', id).single(),
    supabase.from('categorias').select('hierarquia, nome').order('nome'),
    supabase.from('marcas').select('nome').order('nome'),
  ])

  if (!produto) notFound()

  const action = editarProduto.bind(null, id)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/produtos" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Editar Produto</h2>
      </div>

      <form action={action} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome *</label>
            <input name="nome" required defaultValue={produto.nome} className="field" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Descrição</label>
            <textarea name="descricao" rows={3} defaultValue={produto.descricao ?? ''} className="field resize-none" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço de Venda (R$)</label>
            <input name="preco" type="number" step="0.01" min="0" defaultValue={produto.preco} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço de Custo (R$)</label>
            <input name="preco_custo" type="number" step="0.01" min="0" defaultValue={produto.preco_custo} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Categoria</label>
            <select name="categoria" defaultValue={produto.categoria ?? ''} className="field">
              <option value="">Sem categoria</option>
              {(categorias ?? []).map((c) => (
                <option key={c.hierarquia} value={c.hierarquia}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Marca</label>
            <select name="marca" defaultValue={produto.marca ?? ''} className="field">
              <option value="">Sem marca</option>
              {(marcas ?? []).map((m) => (
                <option key={m.nome} value={m.nome}>{m.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Código / SKU</label>
            <input name="codigo" defaultValue={produto.codigo ?? ''} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>
            <select name="ativo" defaultValue={String(produto.ativo)} className="field">
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Salvar Alterações
          </button>
          <Link href="/painel/produtos" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
