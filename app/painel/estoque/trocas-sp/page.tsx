import { createServiceClient } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import Link from 'next/link'
import { NovaTrocaSpForm } from './NovaTrocaSpForm'
import { resolverTrocaSp, excluirTrocaSp } from './actions'

const STATUS: Record<string, { label: string; cls: string }> = {
  enviado: { label: 'Enviado', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  voltou:  { label: 'Voltou',  cls: 'text-green-700 bg-green-50 border-green-200' },
  abatido: { label: 'Abatido', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
}

export default async function TrocasSpPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const [{ data: lojas }, { data: trocas }] = await Promise.all([
    supabase.from('lojas').select('id, nome').order('nome'),
    supabase.from('trocas_sp').select('id, item, fornecedor, quantidade, valor, loja_id, status, observacao, created_at').order('created_at', { ascending: false }).limit(500),
  ])

  const lojasList = (lojas ?? []) as { id: string; nome: string }[]
  const nomeLoja = new Map(lojasList.map(l => [l.id, l.nome]))
  const lista = (trocas ?? []) as {
    id: string; item: string; fornecedor: string; quantidade: number; valor: number; loja_id: string | null; status: string; observacao: string | null; created_at: string
  }[]

  const pendente = lista.filter(t => t.status === 'enviado').reduce((s, t) => s + Number(t.valor ?? 0), 0)
  const fmt = (v: number) => formatBRL(v)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/painel/estoque" className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">Trocas SP</h2>
        </div>
        <Link href="/painel/estoque" className="rounded-lg bg-gray-800 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition">Voltar</Link>
      </div>

      {params.ok && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">Troca salva.</div>
      )}
      {params.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{params.erro}</div>
      )}

      <NovaTrocaSpForm lojas={lojasList} />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold uppercase text-amber-700">Na rua (aguardando resposta)</p>
        <p className="text-2xl font-bold text-amber-700 tabular-nums">{fmt(pendente)}</p>
        <p className="text-[11px] text-amber-600">peças enviadas e ainda não resolvidas (voltou/abatido)</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Peça</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fornecedor</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Loja</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Resolver</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lista.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma troca registrada ainda.</td></tr>
            ) : lista.map(t => {
              const s = STATUS[t.status] ?? STATUS.enviado
              return (
                <tr key={t.id} className="hover:bg-blue-50/60 transition">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(t.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{t.item} <span className="text-gray-400">×{t.quantidade}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.fornecedor}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{nomeLoja.get(t.loja_id ?? '') ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">{fmt(Number(t.valor ?? 0))}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={['inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', s.cls].join(' ')}>{s.label}</span>
                    {t.observacao && <p className="mt-1 text-[11px] text-gray-400 max-w-[180px] truncate" title={t.observacao}>{t.observacao}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {t.status === 'enviado' ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <form action={resolverTrocaSp.bind(null, t.id, 'voltou')}>
                          <button type="submit" className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700 transition">Voltou</button>
                        </form>
                        <form action={resolverTrocaSp.bind(null, t.id, 'abatido')}>
                          <button type="submit" className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition">Abatido</button>
                        </form>
                      </div>
                    ) : (
                      <form action={excluirTrocaSp.bind(null, t.id)} className="flex justify-center">
                        <button type="submit" className="text-xs text-gray-300 hover:text-red-500 transition">✕</button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
