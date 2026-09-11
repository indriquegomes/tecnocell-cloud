import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { TransferenciaForm } from './TransferenciaForm'
import { confirmarRecebimento } from '../actions'
import { formatBRL } from '@/lib/utils'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

type ItemRem = { nome: string; quantidade: number; custo_unitario: number | null; series: string[] | null }
type Remessa = { id: string; origem: string; destino: string; status: string; observacao: string | null; created_at: string; recebida_em: string | null; remessas_estoque_itens: ItemRem[] | null }

export default async function TransferenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const [{ data: depositos }, { data: produtos }, { data: seriesEmEstoque }, { data: remessas }] = await Promise.all([
    supabase.from('depositos').select('id, nome').order('nome'),
    supabase.from('produtos').select('id, nome, codigo, controla_serie').eq('ativo', true).order('nome').limit(500),
    supabase.from('numeros_serie').select('produto_id, deposito_id, serie').eq('status', 'em_estoque').order('serie'),
    supabase.from('remessas_estoque')
      .select('id, origem, destino, status, observacao, created_at, recebida_em, remessas_estoque_itens(nome, quantidade, custo_unitario, series)')
      .order('created_at', { ascending: false }).limit(50),
  ])

  const seriesPorProduto: Record<string, Record<string, string[]>> = {}
  for (const s of (seriesEmEstoque ?? []) as { produto_id: string; deposito_id: string; serie: string }[]) {
    if (!s.produto_id || !s.deposito_id) continue
    ;(seriesPorProduto[s.produto_id] ??= {})[s.deposito_id] ??= []
    seriesPorProduto[s.produto_id][s.deposito_id].push(s.serie)
  }

  const nomeDep = Object.fromEntries((depositos ?? []).map((d) => [d.id, d.nome]))
  const rs = (remessas ?? []) as Remessa[]
  const emTransito = rs.filter((r) => r.status === 'em_transito')
  const recebidas = rs.filter((r) => r.status !== 'em_transito')
  const custoRemessa = (r: Remessa) => (r.remessas_estoque_itens ?? []).reduce((s, i) => s + (i.quantidade ?? 0) * (i.custo_unitario ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/estoque" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Entre Depósitos</h2>
        <Dica texto="Remessa em 2 etapas: sai da origem na hora, mas só entra no destino quando você confirmar a chegada física. Adicione vários itens de uma vez." lado="baixo" />
      </div>

      {params.ok === '1' && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Remessa enviada. Os itens saíram da origem e estão em trânsito.
        </div>
      )}
      {params.ok === '2' && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Recebimento confirmado. Os itens entraram no estoque de destino.
        </div>
      )}
      {params.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.erro}
        </div>
      )}

      <TransferenciaForm
        depositos={depositos ?? []}
        produtos={produtos ?? []}
        seriesPorProduto={seriesPorProduto}
      />

      {/* Em trânsito */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">Em trânsito (aguardando chegada)</h3>
        {emTransito.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma remessa em trânsito.</p>
        ) : (
          <div className="space-y-3">
            {emTransito.map((r) => (
              <div key={r.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800">{nomeDep[r.origem] ?? r.origem} → {nomeDep[r.destino] ?? r.destino}</p>
                    <p className="text-xs text-gray-500">{fmtDate(r.created_at)}{r.observacao ? ' · ' + r.observacao : ''}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {(r.remessas_estoque_itens ?? []).map((i) => i.nome + ' × ' + i.quantidade).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href={`/painel/estoque/transferencias/${r.id}/separacao`} title="Imprimir nota de separação" className="rounded-lg border border-blue-200 p-2 text-blue-700 hover:bg-blue-50 transition">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2m-4-5h2a1 1 0 011 1v7H7v-7a1 1 0 011-1h2m0 0h4" /></svg>
                    </Link>
                    <span className="text-sm font-semibold text-amber-700">{formatBRL(custoRemessa(r))}</span>
                    <form action={confirmarRecebimento.bind(null, r.id)}>
                      <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition">
                        Confirmar recebimento
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recebidas */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">Últimas recebidas</h3>
        {recebidas.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma remessa recebida ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Recebida</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rota</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Itens</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Custo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recebidas.map((r) => (
                  <tr key={r.id} className="hover:bg-blue-50/40 transition">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.recebida_em ? fmtDate(r.recebida_em) : '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{nomeDep[r.origem] ?? r.origem} → {nomeDep[r.destino] ?? r.destino}</td>
                    <td className="px-4 py-3 text-gray-600">{(r.remessas_estoque_itens ?? []).map((i) => i.nome + ' × ' + i.quantidade).join(' · ')}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatBRL(custoRemessa(r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
