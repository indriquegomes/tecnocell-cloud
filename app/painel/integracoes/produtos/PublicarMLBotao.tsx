import { criarRascunhoEIrPraEdicao } from './actions'

export function PublicarMLBotao({
  produtoId, conexoes,
}: {
  produtoId: string
  conexoes: { id: string; nome: string }[]
}) {
  return (
    <form action={criarRascunhoEIrPraEdicao.bind(null, produtoId)} className="inline-flex items-center gap-1.5">
      {conexoes.length > 1 && (
        <select name="conexaoId" defaultValue={conexoes[0].id}
          className="rounded-lg border border-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
          {conexoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      )}
      {conexoes.length === 1 && <input type="hidden" name="conexaoId" value={conexoes[0].id} />}
      <button type="submit"
        className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-200 transition">
        Publicar no Mercado Livre
      </button>
    </form>
  )
}
