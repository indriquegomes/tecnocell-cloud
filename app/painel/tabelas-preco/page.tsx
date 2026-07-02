import { createServiceClient } from '@/lib/supabase/server'
import { criarTabela, deletarTabela } from './actions'
import { ConfirmButton } from '@/components/ConfirmButton'
import Link from 'next/link'

export default async function TabelasPrecoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>
}) {
  const { erro, ok } = await searchParams
  const supabase = await createServiceClient()

  const { data: tabelas } = await supabase
    .from('tabelas_preco')
    .select('*, itens_tabela_preco(count)')
    .order('nome')

  const hoje = new Date().toISOString().slice(0, 10)
  const brDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : null)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Tabelas de Preço</h2>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
      {ok && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Tabela criada com sucesso!</div>}

      {/* Nova tabela */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800">Nova Tabela de Preço</h3>
        <form action={criarTabela} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome</label>
            <input name="nome" required className="field" placeholder="Ex: Tabela Padrão, Atacado..." />
          </div>
          <div className="flex-1 min-w-48">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Descrição</label>
            <input name="descricao" className="field" placeholder="Opcional" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Válida de</label>
            <input name="data_inicio" type="date" className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">até</label>
            <input name="data_fim" type="date" className="field" />
          </div>
          <button type="submit"
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Criar Tabela
          </button>
        </form>
      </div>

      {/* Listagem */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(tabelas ?? []).length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
            Nenhuma tabela de preço cadastrada.
          </div>
        ) : (tabelas ?? []).map((t) => (
          <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-800">{t.nome}</p>
                {t.descricao && <p className="text-xs text-gray-400 mt-0.5">{t.descricao}</p>}
              </div>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${t.ativa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {t.ativa ? 'Ativa' : 'Inativa'}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {Array.isArray(t.itens_tabela_preco) ? t.itens_tabela_preco.length : 0} produtos
            </p>
            {(t.data_inicio || t.data_fim) && (() => {
              const foraVigencia = (t.data_inicio && t.data_inicio > hoje) || (t.data_fim && t.data_fim < hoje)
              return (
                <p className={`text-[11px] ${foraVigencia ? 'text-amber-600' : 'text-gray-400'}`}>
                  {foraVigencia ? '⚠ fora de vigência · ' : ''}Válida {brDate(t.data_inicio) ?? '…'} – {brDate(t.data_fim) ?? '…'}
                </p>
              )
            })()}
            <div className="flex gap-3">
              <Link href={`/painel/tabelas-preco/${t.id}`}
                className="flex-1 text-center rounded-lg border border-blue-200 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition">
                Ver / Editar
              </Link>
              <form action={deletarTabela.bind(null, t.id)}>
                <ConfirmButton message="Excluir tabela?" className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition">
                  Excluir
                </ConfirmButton>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
