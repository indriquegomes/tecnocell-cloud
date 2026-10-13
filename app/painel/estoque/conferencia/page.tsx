import { IconPackage } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { getDepositosCache, getCategoriasCache } from '@/lib/cache-catalogo'
import { buscarLinhasConferencia } from '@/lib/conferencia'
import { ConferenciaTela } from './ConferenciaTela'
import { ImportarConferencia } from './ImportarConferencia'

export default async function ConferenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ deposito?: string; categoria?: string }>
}) {
  const params = await searchParams
  const [depositos, categorias] = await Promise.all([getDepositosCache(), getCategoriasCache()])
  const depsBotao = depositos.filter((d) => d.loja_id)

  const depositoEscolhido = params.deposito || ''
  const depositoNome = depositos.find((d) => d.id === depositoEscolhido)?.nome ?? ''
  const qs = new URLSearchParams()
  if (depositoEscolhido) qs.set('deposito', depositoEscolhido)
  if (params.categoria) qs.set('categoria', params.categoria)

  // Lista on-screen só quando há depósito escolhido (conferência é SEMPRE por depósito).
  const linhas = depositoEscolhido ? await buscarLinhasConferencia(depositoEscolhido, params.categoria ?? '') : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Conferencia de Estoque</h2>
        <Dica texto="Confira o fisico direto na tela: marque + onde sobra, - onde falta e aplique. O modo antigo (Excel) continua disponivel." />
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">Como funciona:</p>
        <p>1. Escolha o deposito (e a categoria, se quiser conferir so uma parte).</p>
        <p>2. Aparece a lista de produtos com o saldo do sistema de cada um.</p>
        <p>3. Conte o fisico e, na linha da peca diferente, clique <b>+</b> se sobrou ou <b>-</b> se faltou (da pra digitar o numero tambem).</p>
        <p>4. Clique em <b>Aplicar correcoes</b> no fim da lista.</p>
      </div>

      <form method="GET" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Deposito *</label>
            <select name="deposito" defaultValue={depositoEscolhido} required className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Escolha o deposito...</option>
              {depsBotao.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Categoria (opcional)</label>
            <select name="categoria" defaultValue={params.categoria ?? ''} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todas</option>
              {(categorias ?? []).map((c) => <option key={c.hierarquia} value={c.hierarquia}>{c.nome}</option>)}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">Aplicar filtro</button>
        </div>
      </form>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-gray-700">Conferir na tela</p>
        {depositoEscolhido ? (
          <ConferenciaTela itens={linhas} depositoId={depositoEscolhido} depositoNome={depositoNome} />
        ) : (
          <p className="text-sm text-gray-400">Escolha um deposito acima para abrir a lista de conferencia na tela.</p>
        )}
      </div>

      <details className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">Modo antigo (Excel)</summary>
        <div className="mt-4 space-y-5">
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700">1. Baixar planilha</p>
            {depositoEscolhido ? (
              <a href={`/painel/estoque/conferencia/exportar?${qs.toString()}`} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition">
                Baixar planilha de conferencia
              </a>
            ) : (
              <p className="text-sm text-gray-400">Escolha um deposito acima para liberar o download da planilha.</p>
            )}
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700">2. Reenviar planilha preenchida</p>
            <ImportarConferencia depositoId={depositoEscolhido} />
          </div>
        </div>
      </details>
    </div>
  )
}
