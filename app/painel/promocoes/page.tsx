import { createServiceClient } from '@/lib/supabase/server'
import { criarPromocao, togglePromocao, deletarPromocao } from './actions'
import { ConfirmButton } from '@/components/ConfirmButton'

export default async function PromocoesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>
}) {
  const { erro, ok } = await searchParams
  const supabase = await createServiceClient()

  const { data: promocoes } = await supabase
    .from('promocoes')
    .select('*')
    .order('created_at', { ascending: false })

  const hoje = new Date().toISOString().split('T')[0]
  const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '�'

  const tipoLabel: Record<string, string> = {
    percentual: 'Desconto %',
    fixo: 'Desconto R$',
    frete: 'Frete Grátis',
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Promoções</h2>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
      {ok && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Promoção criada com sucesso!</div>}

      {/* Formulário nova promoção */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800">Nova Promoção</h3>
        <form action={criarPromocao} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome da Promoção</label>
            <input name="nome" required className="field" placeholder="Ex: Desconto de Verão" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Tipo</label>
            <select name="tipo" className="field">
              <option value="percentual">Desconto Percentual (%)</option>
              <option value="fixo">Desconto Fixo (R$)</option>
              <option value="frete">Frete Grátis</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor</label>
            <input name="valor" type="number" step="0.01" min="0" defaultValue="0" className="field" placeholder="10" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Data Início</label>
            <input name="data_inicio" type="date" defaultValue={hoje} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Data Fim</label>
            <input name="data_fim" type="date" className="field" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Descrição</label>
            <input name="descricao" className="field" placeholder="Descrição opcional..." />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit"
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
              Criar Promoção
            </button>
          </div>
        </form>
      </div>

      {/* Listagem */}
      <div className="space-y-3">
        {(promocoes ?? []).length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
            Nenhuma promoção cadastrada.
          </div>
        ) : (promocoes ?? []).map((p) => {
          const vencida = p.data_fim && p.data_fim < hoje
          return (
            <div key={p.id} className={`rounded-xl border p-4 flex items-center gap-4 ${p.ativa && !vencida ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800">{p.nome}</p>
                  {vencida && <span className="text-xs text-red-500 font-medium">Vencida</span>}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {tipoLabel[p.tipo] ?? p.tipo} · {p.tipo !== 'frete' ? (p.tipo === 'percentual' ? `${p.valor}%` : `R$ ${p.valor}`) : ''} · {fmtDate(p.data_inicio)} até {fmtDate(p.data_fim)}
                </p>
                {p.descricao && <p className="text-xs text-gray-400 mt-0.5">{p.descricao}</p>}
              </div>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${p.ativa && !vencida ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {p.ativa && !vencida ? 'Ativa' : 'Inativa'}
              </span>
              <div className="flex gap-2">
                <form action={togglePromocao.bind(null, p.id, p.ativa)}>
                  <button type="submit" className="text-xs font-medium text-blue-600 hover:text-blue-800">
                    {p.ativa ? 'Pausar' : 'Ativar'}
                  </button>
                </form>
                <form action={deletarPromocao.bind(null, p.id)}>
                  <ConfirmButton message="Excluir promoção?" className="text-xs font-medium text-red-500 hover:text-red-700">
                    Excluir
                  </ConfirmButton>
                </form>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

