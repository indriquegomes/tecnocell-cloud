import { createServiceClient, permissoesUsuarioAtual } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'
import { criarProduto } from '../actions'
import { ImageUpload } from '@/components/ImageUpload'
import { PrecoFields } from '../PrecoFields'
import { SubmitButton } from '@/components/SubmitButton'
import Link from 'next/link'

export default async function NovoProdutoPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()
  const [{ data: categorias }, { data: marcas }, { data: fornecedoresRaw }] = await Promise.all([
    supabase.from('categorias').select('hierarquia, nome').order('nome'),
    supabase.from('marcas').select('nome').order('nome'),
    // só fornecedores (97) — antes carregava 500 pessoas e filtrava, perdendo quem
    // ficava além do 500º; agora filtra por tipo no servidor e traz todos.
    supabase.from('pessoas').select('id, nome').in('tipo', ['fornecedor', 'ambos']).order('nome'),
  ])
  const fornecedores = fornecedoresRaw ?? []
  const { permissoes, isMaster } = await permissoesUsuarioAtual()
  const podeCusto = temPermissao(permissoes, 'produto_custo', isMaster)

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

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      <form action={criarProduto} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5" encType="multipart/form-data">
        <div className="grid gap-5 sm:grid-cols-2">
          <ImageUpload />
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome *</label>
            <input name="nome" required className="field" placeholder="Nome do produto" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Descrição</label>
            <textarea name="descricao" rows={3} className="field resize-none" placeholder="Descrição opcional" />
          </div>
          <PrecoFields podeCusto={podeCusto} />
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
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Modelo</label>
            <input name="modelo" className="field" placeholder="Ex: iPhone 13, Galaxy A54" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Código / SKU</label>
            <input name="codigo" className="field" placeholder="Ex: TC-001" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Unidade</label>
            <select name="unidade" defaultValue="UN" className="field">
              <option value="UN">UN — Unidade</option>
              <option value="CX">CX — Caixa</option>
              <option value="PCT">PCT — Pacote</option>
              <option value="PAR">PAR — Par</option>
              <option value="KIT">KIT — Kit</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Código de Barras (EAN)</label>
            <input name="ean" className="field" placeholder="Bipe ou digite" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Fornecedor</label>
            <select name="fornecedor_id" className="field">
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Prateleira / Localização</label>
            <input name="prateleira" className="field" placeholder="Ex: A3, Vitrine 2" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Estoque Mínimo</label>
            <input name="estoque_minimo" type="number" min="0" defaultValue="0" className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>
            <select name="ativo" className="field">
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
          <label className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 cursor-pointer">
            <input name="visivel_catalogo" type="checkbox" value="true" defaultChecked className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-800">Visível no catálogo / site</span>
          </label>
          <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 cursor-pointer">
            <input name="controla_serie" type="checkbox" value="true" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span>
              <span className="block text-sm font-medium text-gray-800">Controla número de série / IMEI</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Marque para aparelhos. Cada unidade será cadastrada com seu IMEI e o estoque conta por unidade.
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <SubmitButton pendingText="Salvando..." className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
            Salvar Produto
          </SubmitButton>
          <Link href="/painel/produtos" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
