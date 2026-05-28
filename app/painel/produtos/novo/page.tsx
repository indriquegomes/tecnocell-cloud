import { createServiceClient } from '@/lib/supabase/server'
import { criarProduto } from '../actions'
import Link from 'next/link'

export default async function NovoProdutoPage() {
  const supabase = await createServiceClient()
  const [{ data: categorias }, { data: marcas }] = await Promise.all([
    supabase.from('categorias').select('hierarquia, nome').order('nome'),
    supabase.from('marcas').select('nome').order('nome'),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/produtos" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Novo Produto</h2>
      </div>

      <form action={criarProduto} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome *</label>
            <input name="nome" required className="field" placeholder="Nome do produto" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Descrição</label>
            <textarea name="descricao" rows={3} className="field resize-none" placeholder="Descrição opcional" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço de Venda (R$)</label>
            <input name="preco" type="number" step="0.01" min="0" defaultValue="0" className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço de Custo (R$)</label>
            <input name="preco_custo" type="number" step="0.01" min="0" defaultValue="0" className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Categoria</label>
            <select name="categoria" className="field">
              <option value="">Sem categoria</option>
              {(categorias ?? []).map((c) => (
                <option key={c.hierarquia} value={c.hierarquia}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Marca</label>
            <select name="marca" className="field">
              <option value="">Sem marca</option>
              {(marcas ?? []).map((m) => (
                <option key={m.nome} value={m.nome}>{m.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Código / SKU</label>
            <input name="codigo" className="field" placeholder="Ex: TC-001" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>
            <select name="ativo" className="field">
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Salvar Produto
          </button>
          <Link href="/painel/produtos" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
