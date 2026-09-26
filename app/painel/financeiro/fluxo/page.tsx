import { createServiceClient } from '@/lib/supabase/server'
import { FinanceiroTabs } from '../FinanceiroTabs'
import { PlanejamentoConfig } from './PlanejamentoConfig'
import { formatBRL, hojeSP } from '@/lib/utils'

const FIXAS_PADRAO = ['Salários', 'Aluguel', 'Energia/Luz', 'Impostos', 'Contabilidade']

type Lanc = { descricao: string | null; valor: number | null; categoria: string | null; data_vencimento: string | null; pessoa_nome: string | null }

export default async function FluxoPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()
  const { data: cfg } = await supabase.from('configuracoes').select('valor').eq('chave', 'planejamento').maybeSingle()
  const raw = (cfg?.valor ?? {}) as { categoriasFixas?: string[]; margem?: number }
  const categoriasFixas = raw.categoriasFixas && raw.categoriasFixas.length ? raw.categoriasFixas : FIXAS_PADRAO
  const margem = typeof raw.margem === 'number' ? raw.margem : 10

  const hoje = hojeSP()
  const { data: lancs } = await supabase.from('lancamentos')
    .select('descricao, valor, categoria, data_vencimento, pessoa_nome')
    .eq('tipo', 'pagar').eq('status', 'pendente').gte('data_vencimento', hoje)
    .order('data_vencimento')

  const porMes: Record<string, { total: number; fixas: number }> = {}
  const [ay, am] = hoje.split('-').map(Number)
  for (const l of (lancs ?? []) as Lanc[]) {
    const mes = (l.data_vencimento ?? '').slice(0, 7)
    if (!mes || mes < hoje.slice(0, 7)) continue
    const [y, m] = mes.split('-').map(Number)
    if ((y - ay) * 12 + (m - am) > 23) continue
    porMes[mes] = porMes[mes] || { total: 0, fixas: 0 }
    const v = Number(l.valor) || 0
    porMes[mes].total += v
    if (categoriasFixas.includes(l.categoria ?? '')) porMes[mes].fixas += v
  }

  const mesAtual = hoje.slice(0, 7)
  const fixasMes = porMes[mesAtual]?.fixas ?? 0
  const sugestao = fixasMes * (1 + margem / 100)
  const meses = Object.keys(porMes).sort()
  const nomeMes = (m: string) => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }

  return (
    <div className="space-y-6">
      <FinanceiroTabs active="fluxo" />
      <PlanejamentoConfig categorias={categoriasFixas} margem={margem} />

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <p className="text-sm font-semibold text-blue-800">💡 Sugestão de transferência pra conta CNPJ</p>
        <p className="mt-1 text-3xl font-bold text-blue-900">{formatBRL(sugestao)}</p>
        <p className="mt-1 text-xs text-blue-600">Despesas fixas deste mês ({formatBRL(fixasMes)}) + {margem}% de margem.</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-800">Fluxo de caixa futuro (contas a pagar)</h2>
          <p className="text-xs text-gray-400">Próximos meses — cadastre em "A Receber / A Pagar" com "Parcelar" ou "Repetir todo mês".</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Mês</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Fixo</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Variável</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {meses.map((m) => (
                <tr key={m} className={m === mesAtual ? 'bg-blue-50/50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-2 text-sm font-medium text-gray-800 capitalize">{nomeMes(m)}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-600">{formatBRL(porMes[m].fixas)}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-600">{formatBRL(porMes[m].total - porMes[m].fixas)}</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">{formatBRL(porMes[m].total)}</td>
                </tr>
              ))}
              {meses.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma conta a pagar futura ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
    </div>
  )
}
