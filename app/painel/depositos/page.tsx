import { createServiceClient } from '@/lib/supabase/server'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { criarDeposito, editarDeposito, deletarDeposito } from './actions'
import { Dica } from '@/components/Dica'
import Link from 'next/link'

export default async function DepositosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; editar?: string; busca?: string; so_inativos?: string }>
}) {
  const { erro, editar, busca, so_inativos } = await searchParams
  const supabase = await createServiceClient()

  let qDepositos = supabase
    .from('depositos')
    .select('id, nome, descricao, empresa_id, empresa, ativo, responsavel, telefone, email, cep, cidade, uf')
    .order('nome')

  if (busca) qDepositos = qDepositos.ilike('nome', `%${busca}%`)
  if (so_inativos === '1') qDepositos = qDepositos.eq('ativo', false)

  const [{ data: depositos }, { data: estoqueRaw }, { data: empresas }] = await Promise.all([
    qDepositos,
    supabase.from('estoque').select('deposito_id, quantidade, produto_id'),
    supabase.from('empresas').select('id, nome').order('nome'),
  ])

  const editando = depositos?.find((d) => d.id === editar)

  type DepositoRow = NonNullable<typeof depositos>[number]
  const comContagem = (depositos ?? []).map((d: DepositoRow) => {
    const itens = (estoqueRaw ?? []).filter((e) => e.deposito_id === d.id)
    const totalQtd = itens.reduce((s, e) => s + (e.quantidade ?? 0), 0)
    const totalProd = new Set(itens.map((e) => e.produto_id)).size
    return { ...d, totalQtd, totalProd }
  })

  const UF_OPTS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">Depósitos</h2>
          <Dica texto="Locais físicos de armazenamento de estoque (ex: Loja Petrópolis, Depósito Central). O estoque é separado por depósito." />
        </div>
        <span className="text-sm text-gray-400">{comContagem.length} registro{comContagem.length !== 1 ? 's' : ''}</span>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap items-center gap-3">
        <input name="busca" defaultValue={busca ?? ''} placeholder="Buscar depósito..."
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" name="so_inativos" value="1" defaultChecked={so_inativos === '1'}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          Somente inativos
        </label>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Filtrar
        </button>
        {(busca || so_inativos) && (
          <Link href="/painel/depositos" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
            Limpar
          </Link>
        )}
      </form>

      {/* Formulário criar/editar */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-5 text-sm font-semibold text-gray-700">
          {editando ? `Editando: ${editando.nome}` : 'Novo Depósito'}
        </h3>
        <form action={editando ? editarDeposito.bind(null, editando.id) : criarDeposito} className="space-y-4">
          {/* Linha 1: Nome + Empresa */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Nome *</label>
              <input name="nome" required defaultValue={editando?.nome ?? ''} className="field" placeholder="Ex: Loja Principal" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Empresa</label>
              <select name="empresa_id" defaultValue={editando?.empresa_id ?? ''} className="field"
                >
                <option value="">Sem vínculo</option>
                {(empresas ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 2: Responsável + Telefone + E-mail */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Responsável</label>
              <input name="responsavel" defaultValue={editando?.responsavel ?? ''} className="field" placeholder="Nome do responsável" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Telefone</label>
              <input name="telefone" defaultValue={editando?.telefone ?? ''} className="field" placeholder="(xx) xxxxx-xxxx" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">E-mail</label>
              <input name="email" type="email" defaultValue={editando?.email ?? ''} className="field" placeholder="contato@loja.com" />
            </div>
          </div>

          {/* Linha 3: CEP + Cidade + UF */}
          <div className="grid grid-cols-[160px_1fr_120px] gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">CEP</label>
              <input name="cep" defaultValue={editando?.cep ?? ''} className="field" placeholder="00000-000" maxLength={9} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Cidade</label>
              <input name="cidade" defaultValue={editando?.cidade ?? ''} className="field" placeholder="Ex: Teresópolis" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">UF</label>
              <select name="uf" defaultValue={editando?.uf ?? ''} className="field">
                <option value="">—</option>
                {UF_OPTS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Linha 4: Descrição + Ativo */}
          <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Descrição / Observação</label>
              <input name="descricao" defaultValue={editando?.descricao ?? ''} className="field" placeholder="Opcional" />
            </div>
            <div className="flex items-center gap-3 pb-2">
              <label className="text-xs font-medium text-gray-600">Ativo</label>
              <select name="ativo" defaultValue={editando ? (editando.ativo === false ? 'false' : 'true') : 'true'} className="field w-28">
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit"
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
              {editando ? 'Salvar' : 'Adicionar'}
            </button>
            {editando && (
              <Link href="/painel/depositos"
                className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Cancelar
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Depósito</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Empresa</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Localização</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Responsável</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Estoque</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {comContagem.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum depósito cadastrado.</td></tr>
            ) : comContagem.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-800">{d.nome}</p>
                  {d.descricao && <p className="text-xs text-gray-400">{d.descricao}</p>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{d.empresa || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {d.cidade && d.uf ? `${d.cidade}/${d.uf}` : d.cidade || d.uf || (d.cep ? `CEP ${d.cep}` : '—')}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  <div>{d.responsavel || '—'}</div>
                  {d.telefone && <div className="text-xs text-gray-400">{d.telefone}</div>}
                </td>
                <td className="px-4 py-3 text-center">
                  {d.totalQtd > 0 ? (
                    <Link href={`/painel/estoque?deposito=${d.id}`}
                      className="text-sm font-semibold text-blue-600 hover:underline">
                      {d.totalQtd} un / {d.totalProd} prod
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${d.ativo !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {d.ativo !== false ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/depositos?editar=${d.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                      Editar
                    </Link>
                    <BotaoExcluir action={deletarDeposito.bind(null, d.id)} mensagem="Excluir este depósito?" />
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
