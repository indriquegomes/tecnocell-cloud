import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { IconPlus, IconFile } from '@/components/icons'
import { formatBRL } from '@/lib/utils'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { deletarNota } from './actions'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

const STATUS_COLOR: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-700',
  recebida: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-600',
}

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ ordem?: string; dir?: string; erro?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const ordemAtual = params.ordem ?? 'created_at'
  const ordemDir = params.dir === 'desc'
  const camposDB: Record<string, string> = { created_at: 'created_at', numero: 'numero', valor_total: 'valor_total', status: 'status', data_entrada: 'data_entrada' }
  const sortLink = (o: string) => {
    const ativo = ordemAtual === o
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'desc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ordem: o, ...(nextDir === 'asc' ? { dir: 'asc' } : {}) }).toString()
    return { href: `/painel/compras?${qs}`, arrow, ativo }
  }

  const { data: notas } = await supabase
    .from('notas_entrada')
    .select('id, numero, status, valor_total, data_entrada, data_emissao, pessoas(nome)')
    .order(camposDB[ordemAtual] ?? 'created_at', { ascending: !ordemDir })
    .limit(200)

  // Resumo do topo — via fetchAll pra contar/somar TODAS as notas (não só as 200 exibidas)
  const resumo = await fetchAll<{ status: string; valor_total: number | null }>((from, to) =>
    supabase.from('notas_entrada').select('status, valor_total').range(from, to))
  const totalNotas = resumo.length
  const totalRecebido = resumo.filter((n) => n.status === 'recebida').reduce((s, n) => s + (Number(n.valor_total) || 0), 0)
  const totalPendentes = resumo.filter((n) => n.status === 'pendente').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconFile className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Notas de Entrada</h2>
          <Dica texto="Registro de compras de fornecedores. Ao finalizar uma nota, o estoque dos produtos é atualizado automaticamente." />
        </div>
        <Link href="/painel/compras/nova"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          <IconPlus className="h-4 w-4" /> Nova Nota
        </Link>
      </div>

      {params.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{params.erro}</div>
      )}

      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Notas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{totalNotas}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Recebido</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{formatBRL(totalRecebido)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Pendentes</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">{totalPendentes}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[
                { o: 'numero',       l: 'Número',    a: 'text-left' },
                { o: 'data_entrada', l: 'Entrada',   a: 'text-left' },
                { o: 'valor_total',  l: 'Total',     a: 'text-left' },
                { o: 'status',       l: 'Status',    a: 'text-center' },
              ].map(({ o, l, a }) => {
                const s = sortLink(o)
                return <th key={o} className={`px-4 py-3 ${a} text-xs font-semibold text-gray-500 uppercase`}>
                  <Link href={s.href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${s.ativo ? 'text-blue-600' : ''}`}>{l} <span className="text-gray-400">{s.arrow}</span></Link>
                </th>
              })}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fornecedor</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(notas ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                Nenhuma nota. <Link href="/painel/compras/nova" className="text-blue-500 hover:underline">Cadastrar</Link>.
              </td></tr>
            ) : (notas ?? []).map((n) => (
              <tr key={n.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm font-mono text-gray-600">{n.numero || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {n.data_entrada ? new Date(n.data_entrada + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3 text-sm font-semibold tabular-nums text-gray-800">
                  {formatBRL(Number(n.valor_total) || 0)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[n.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {n.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">
                  {(n.pessoas as unknown as { nome: string } | null)?.nome ?? '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/compras/${n.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                      Abrir
                    </Link>
                    <BotaoExcluir action={deletarNota.bind(null, n.id)} mensagem="Excluir esta nota de entrada?" />
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
