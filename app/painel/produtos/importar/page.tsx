import { IconPackage } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { ImportarProdutos } from './ImportarProdutos'
import { getCategoriasCache, getMarcasCache } from '@/lib/cache-catalogo'

export default async function ImportarProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; marca?: string; status?: string }>
}) {
  const params = await searchParams
  const [categorias, marcas] = await Promise.all([getCategoriasCache(), getMarcasCache()])

  const qs = new URLSearchParams()
  if (params.categoria) qs.set('categoria', params.categoria)
  if (params.marca) qs.set('marca', params.marca)
  if (params.status) qs.set('status', params.status)
  const hrefExportar = `/painel/produtos/importar/exportar${qs.toString() ? '?' + qs.toString() : ''}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Importar Itens</h2>
          <Dica texto="Sobe a planilha de produtos exportada do sistema antigo. Mostra o que vai mudar antes de gravar; so grava depois que voce confirma." />
        </div>
        <a href={hrefExportar}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">
          Baixar planilha atual
        </a>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">Como funciona:</p>
        <p>1. No sistema antigo, exporte a tabela de produtos em .xlsx — ou clique em <b>Baixar planilha atual</b> pra editar o que ja esta aqui.</p>
        <p>2. Envie aqui. A tela confere e mostra o que e novo e o que vai mudar — <b>sem gravar nada ainda</b>.</p>
        <p>3. Confira e clique em confirmar pra gravar.</p>
        <p className="pt-1">
          A exportacao do sistema antigo vem <b>paginada</b> (varios arquivos). Pode enviar um de cada vez,
          em qualquer ordem: cada arquivo so mexe nos produtos que ele traz. Produto que nao esta
          no arquivo fica como esta — nada e apagado.
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Filtrar planilha por categoria</label>
          <select name="categoria" defaultValue={params.categoria ?? ''}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas as categorias</option>
            {(categorias ?? []).map((c) => <option key={c.hierarquia} value={c.hierarquia}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Marca</label>
          <select name="marca" defaultValue={params.marca ?? ''}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas as marcas</option>
            {(marcas ?? []).map((m) => <option key={m.nome} value={m.nome}>{m.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select name="status" defaultValue={params.status ?? ''}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Ativos e inativos</option>
            <option value="ativos">Só ativos</option>
            <option value="inativos">Só inativos</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Aplicar filtro
        </button>
        {(params.categoria || params.marca || params.status) && (
          <a href="/painel/produtos/importar" className="text-sm text-gray-400 hover:text-gray-600">Limpar filtro</a>
        )}
        <span className="ml-auto self-center text-xs text-gray-400">O filtro vale só pra "Baixar planilha atual" — não muda o que é enviado aqui embaixo.</span>
      </form>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <ImportarProdutos />
      </div>
    </div>
  )
}
