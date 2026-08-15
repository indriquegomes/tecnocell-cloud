import { IconUsers } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { ImportarPessoas } from './ImportarPessoas'

export default async function ImportarClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const params = await searchParams
  const hrefExportar = params.tipo ? `/painel/clientes/importar/exportar?tipo=${params.tipo}` : '/painel/clientes/importar/exportar'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconUsers className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Importar / Exportar Clientes</h2>
          <Dica texto="Baixa os clientes e fornecedores em planilha, edita no Excel e reenvia. Mostra o que vai mudar antes de gravar." />
        </div>
        <a href={hrefExportar}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">
          Baixar planilha atual
        </a>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">Como funciona:</p>
        <p>1. Clique em <b>Baixar planilha atual</b> pra pegar todos os clientes/fornecedores de hoje.</p>
        <p>2. Edite no Excel. <b>Não mexa na coluna ID</b> — ela é o que liga cada linha ao cadastro certo.</p>
        <p>3. Pra cadastrar alguém novo, adicione uma linha e deixe o ID em branco.</p>
        <p>4. Envie aqui. A tela confere e mostra o que muda — <b>sem gravar nada ainda</b>. Confirme pra gravar.</p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Filtrar planilha por tipo</label>
          <select name="tipo" defaultValue={params.tipo ?? ''}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos</option>
            <option value="cliente">Só clientes</option>
            <option value="fornecedor">Só fornecedores</option>
            <option value="ambos">Só "ambos"</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Aplicar filtro
        </button>
        {params.tipo && (
          <a href="/painel/clientes/importar" className="text-sm text-gray-400 hover:text-gray-600">Limpar filtro</a>
        )}
        <span className="ml-auto self-center text-xs text-gray-400">O filtro vale só pra "Baixar planilha atual" — não muda o que é enviado aqui embaixo.</span>
      </form>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <ImportarPessoas />
      </div>
    </div>
  )
}
