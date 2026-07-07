import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { NovaPromocaoForm } from './NovaPromocaoForm'

const TIPO_LABEL: Record<string, string> = {
  valor_direto: 'Valor Direto',
  leve_x_pague_y: 'Leve X Pague Y',
  acima_x_pague_y: 'Acima de X un. Pague Y',
  percentual: 'Desconto %',
  fixo: 'Desconto R$',
}

export default async function PromocoesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()

  const { data: promocoes } = await supabase
    .from('promocoes')
    .select('*')
    .order('created_at', { ascending: false })

  const hoje = new Date().toISOString().split('T')[0]
  const lista = promocoes ?? []

  // sem data_fim = não expira
  const ativas = lista.filter(p => p.ativa && (!p.data_fim || p.data_fim >= hoje)).length
  const expiradas = lista.filter(p => p.data_fim && p.data_fim < hoje).length

  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Promoções</h2>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Total</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{lista.length}</p>
        </div>
        <div className="rounded-xl border border-green-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Ativas agora</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{ativas}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Expiradas</p>
          <p className="mt-1 text-2xl font-bold text-gray-400">{expiradas}</p>
        </div>
      </div>

      <NovaPromocaoForm hoje={hoje} />

      {/* Lista */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="font-semibold text-gray-800">Promoções cadastradas</h3>
        </div>
        {lista.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Nenhuma promoção cadastrada.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-6 py-3">Nome</th>
                <th className="px-6 py-3">Tipo</th>
                <th className="px-6 py-3">Período</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map(p => {
                const expirada = !!p.data_fim && p.data_fim < hoje
                const ativa = p.ativa && !expirada
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3 font-medium text-gray-800">{p.nome}</td>
                    <td className="px-6 py-3 text-gray-500">{TIPO_LABEL[p.tipo] ?? p.tipo}</td>
                    <td className="px-6 py-3 text-gray-500">{fmtDate(p.data_inicio)} → {fmtDate(p.data_fim)}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold
                        ${ativa ? 'bg-green-100 text-green-700' : expirada ? 'bg-gray-100 text-gray-400' : 'bg-yellow-100 text-yellow-700'}`}>
                        {ativa ? 'Ativa' : expirada ? 'Expirada' : 'Pausada'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link href={`/painel/promocoes/${p.id}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                        Ver detalhes →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
