import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { formatBRL, formatDate } from '@/lib/utils'
import { BotaoCancelar } from '../../encomendas/BotaoCancelar'

type Encomenda = {
  id: string; pessoa_nome: string; item_nome: string; temporario: boolean;
  quantidade: number; valor_venda: number | null; custo: number | null;
  sinal: number; status: string; loja_id: string | null; observacoes: string | null;
  created_at: string
}

const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', comprada: 'Comprada (aguardando)', aprovada: 'Chegou', cancelada: 'Cancelada' }
const STATUS_CLS: Record<string, string> = {
  aberta: 'bg-amber-50 text-amber-700', comprada: 'bg-blue-50 text-blue-700', aprovada: 'bg-emerald-50 text-emerald-700', cancelada: 'bg-gray-100 text-gray-500',
}

export default async function EncomendasPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const supabase = await createServiceClient()
  const { ativa, todas } = await lojasDoUsuario().catch(() => ({ ativa: null, todas: true }))

  const encomendas = await fetchAll<Encomenda>((from, to) => {
    let q = supabase.from('encomendas').select('id, pessoa_nome, item_nome, temporario, quantidade, valor_venda, custo, sinal, status, loja_id, observacoes, created_at').order('created_at', { ascending: false }).range(from, to)
    if (!todas && ativa?.id) q = q.eq('loja_id', ativa.id)
    return q
  })

  const filtradas = status && status !== 'todas' ? encomendas.filter((e) => e.status === status) : encomendas
  const contagem = { aberta: encomendas.filter((e) => e.status === 'aberta').length, comprada: encomendas.filter((e) => e.status === 'comprada').length, aprovada: encomendas.filter((e) => e.status === 'aprovada').length, cancelada: encomendas.filter((e) => e.status === 'cancelada').length }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">📦 Encomendas</h2>
        <p className="mt-0.5 text-sm text-gray-500">Peças que clientes pediram e ainda não entraram no estoque.</p>
      </div>

      {/* Filtro por status */}
      <div className="flex flex-wrap gap-2">
        {([['todas', `Todas (${encomendas.length})`], ['aberta', `Abertas (${contagem.aberta})`], ['comprada', `Aguardando (${contagem.comprada})`], ['aprovada', `Chegaram (${contagem.aprovada})`], ['cancelada', `Canceladas (${contagem.cancelada})`]] as const).map(([k, label]) => (
          <a key={k} href={k === 'todas' ? '/painel/estoque/encomendas' : `/painel/estoque/encomendas?status=${k}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${(status ?? 'todas') === k ? 'bg-[#1B6CA8] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {label}
          </a>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">Nenhuma encomenda aqui. 🎉</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Item</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-500">Qtd</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Venda</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Sinal</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Criada</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{e.pessoa_nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {e.item_nome}
                    {e.temporario && <span className="ml-1.5 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600">sem cadastro</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-600">{e.quantidade}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">{e.valor_venda ? formatBRL(e.valor_venda) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">{e.sinal > 0 ? formatBRL(e.sinal) : '—'}</td>
                  <td className="px-4 py-3 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[e.status] ?? 'bg-gray-100 text-gray-500'}`}>{STATUS_LABEL[e.status] ?? e.status}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(e.created_at.slice(0, 10))}</td>
                  <td className="px-4 py-3 text-right">{e.status === 'aberta' ? <BotaoCancelar id={e.id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

