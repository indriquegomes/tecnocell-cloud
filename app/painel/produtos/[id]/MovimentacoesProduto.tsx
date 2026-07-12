import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'

// Últimas movimentações DESTE produto (venda, devolução, entrada/saída/ajuste manual),
// igual à aba do SIGE. Livro-razão unificado, ordenado por data. Read-only; pra ver
// tudo/filtrar, tem o Histórico completo (Estoque → Histórico).
type Sinal = 'entra' | 'sai' | 'neutro'
type Linha = { key: string; data: string; label: string; sinal: Sinal; deposito: string; qtd: number; obs: string }

const BADGE: Record<Sinal, string> = {
  entra: 'bg-green-50 text-green-700 border-green-200',
  sai: 'bg-red-50 text-red-700 border-red-200',
  neutro: 'bg-blue-50 text-blue-700 border-blue-200',
}
const SINAL: Record<Sinal, string> = { entra: '+', sai: '−', neutro: '' }

export async function MovimentacoesProduto({ produtoId, produtoNome }: { produtoId: string; produtoNome: string }) {
  const supabase = await createServiceClient()

  const [{ data: vendas }, { data: devolucoes }, { data: manuais }, { data: depositos }] = await Promise.all([
    supabase.from('vendas')
      .select('numero, created_at, status, pessoa_id, deposito_id, pessoas(nome), itens_venda!inner(quantidade, produto_id)')
      .eq('itens_venda.produto_id', produtoId).neq('status', 'aberta')
      .order('created_at', { ascending: false }).limit(30),
    supabase.from('devolucoes')
      .select('created_at, pessoa_nome, motivo, deposito_id, itens_devolucao!inner(quantidade, produto_id)')
      .eq('itens_devolucao.produto_id', produtoId)
      .order('created_at', { ascending: false }).limit(30),
    supabase.from('movimentacoes_estoque')
      .select('deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, created_at')
      .eq('produto_id', produtoId).order('created_at', { ascending: false }).limit(30),
    supabase.from('depositos').select('id, nome'),
  ])

  const depMap = Object.fromEntries((depositos ?? []).map((d) => [d.id, d.nome]))
  const linhas: Linha[] = []

  for (const v of (vendas ?? []) as unknown as { numero: number | null; created_at: string; deposito_id: string | null; pessoas: { nome: string } | null; itens_venda: { quantidade: number }[] }[]) {
    const qtd = v.itens_venda.reduce((s, it) => s + (it.quantidade ?? 0), 0)
    linhas.push({ key: 'v' + v.numero + v.created_at, data: v.created_at, label: 'Venda', sinal: 'sai', deposito: depMap[v.deposito_id ?? ''] ?? '—', qtd, obs: v.pessoas?.nome ? `Venda${v.numero ? ' #' + v.numero : ''} · ${v.pessoas.nome}` : `Venda${v.numero ? ' #' + v.numero : ''}` })
  }
  for (const d of (devolucoes ?? []) as unknown as { created_at: string; pessoa_nome: string | null; motivo: string | null; deposito_id: string | null; itens_devolucao: { quantidade: number }[] }[]) {
    const qtd = d.itens_devolucao.reduce((s, it) => s + (it.quantidade ?? 0), 0)
    linhas.push({ key: 'd' + d.created_at, data: d.created_at, label: 'Devolução', sinal: 'entra', deposito: depMap[d.deposito_id ?? ''] ?? '—', qtd, obs: [d.pessoa_nome, d.motivo].filter(Boolean).join(' · ') || 'Devolução' })
  }
  for (const m of (manuais ?? []) as { deposito_id: string; operacao: string; quantidade: number; qtd_anterior: number | null; qtd_nova: number | null; observacao: string | null; created_at: string }[]) {
    const sinal: Sinal = m.operacao === 'entrada' ? 'entra' : m.operacao === 'saida' ? 'sai' : 'neutro'
    const label = m.operacao === 'entrada' ? 'Entrada' : m.operacao === 'saida' ? 'Saída' : 'Ajuste'
    const saldo = m.qtd_anterior != null && m.qtd_nova != null ? ` (${m.qtd_anterior}→${m.qtd_nova})` : ''
    linhas.push({ key: 'm' + m.created_at, data: m.created_at, label, sinal, deposito: depMap[m.deposito_id] ?? '—', qtd: m.quantidade, obs: (m.observacao ?? '—') + saldo })
  }

  linhas.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
  const rows = linhas.slice(0, 30)

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Últimas Movimentações</h3>
        <Link href={`/painel/estoque/historico?produto=${encodeURIComponent(produtoNome)}`}
          className="text-xs font-medium text-blue-600 hover:underline">Ver todas →</Link>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Nenhuma movimentação registrada pra este produto.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tipo</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Depósito</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Data</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Qtd</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-blue-50/60">
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE[r.sinal]}`}>{r.label}</span>
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">{r.deposito}</td>
                  <td className="px-3 py-2 text-sm text-gray-500 whitespace-nowrap">{fmtDate(r.data)}</td>
                  <td className={`px-3 py-2 text-right text-sm font-semibold tabular-nums ${r.sinal === 'sai' ? 'text-red-600' : r.sinal === 'entra' ? 'text-green-600' : 'text-gray-700'}`}>{SINAL[r.sinal]}{r.qtd}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.obs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
