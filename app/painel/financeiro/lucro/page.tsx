import { relatorioLucroMensal } from './actions'
import { formatBRL } from '@/lib/utils'
import { FinanceiroTabs } from '../FinanceiroTabs'

// Relatório de Lucro Mensal — cruza compras (custo) × vendas (faturamento/custo),
// por mês e por loja. Mostra o lucro bruto do mês e acende quando vendeu mais do que
// comprou (a diferença saiu do estoque).
export default async function LucroMensalPage() {
  const { linhas, inova } = await relatorioLucroMensal()

  const total = (campo: 'faturamento' | 'custoVendido' | 'compras' | 'lucroBruto') =>
    linhas.reduce((s, l) => s + l[campo], 0)

  return (
    <div className="space-y-5">
      <FinanceiroTabs active="lucro" />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Financeiro</p>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Lucro Mensal</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Faturamento − custo vendido = lucro bruto. ⚠️ acende quando vendeu mais que comprou (saiu do estoque).
          </p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          Nenhuma venda concluída ainda.
        </div>
      ) : (
        <div className="space-y-5">
          {/* Cartões de totais */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Faturamento', valor: total('faturamento'), cor: 'text-gray-900' },
              { label: 'Custo vendido', valor: total('custoVendido'), cor: 'text-orange-600' },
              { label: 'Compras', valor: total('compras'), cor: 'text-blue-700' },
              { label: 'Lucro bruto', valor: total('lucroBruto'), cor: total('lucroBruto') >= 0 ? 'text-green-600' : 'text-red-600' },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-gray-400">{c.label}</p>
                <p className={`mt-1 text-xl font-bold ${c.cor}`}>{formatBRL(c.valor)}</p>
              </div>
            ))}
          </div>

          {/* Tabela por mês e loja */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-3">Mês</th>
                  <th className="px-4 py-3">Loja</th>
                  <th className="px-4 py-3 text-right">Faturamento</th>
                  <th className="px-4 py-3 text-right">Custo vendido</th>
                  <th className="px-4 py-3 text-right">Compras</th>
                  <th className="px-4 py-3 text-right">Lucro bruto</th>
                  <th className="px-4 py-3 text-center">Estoque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {linhas.map((l) => (
                  <tr key={`${l.mes}|${l.lojaId}`} className="hover:bg-blue-50/40">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{l.mes}</td>
                    <td className="px-4 py-3 text-gray-800">{l.lojaNome}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatBRL(l.faturamento)}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{formatBRL(l.custoVendido)}</td>
                    <td className="px-4 py-3 text-right text-blue-700">{formatBRL(l.compras)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${l.lucroBruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatBRL(l.lucroBruto)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {l.vendeuMaisQueComprou ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                          ⚠️ {formatBRL(l.estoqueDrenado)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">ok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ciclo Inova (10 dias) */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Ciclo Inova — custo vendido a cada 10 dias</h3>
            <p className="text-sm text-gray-500 mb-3">Quanto pagar à Inova em cada ciclo (só o custo do que foi vendido).</p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-4 py-3">Mês</th>
                    <th className="px-4 py-3">Loja</th>
                    <th className="px-4 py-3 text-right">1–10</th>
                    <th className="px-4 py-3 text-right">11–20</th>
                    <th className="px-4 py-3 text-right">21–fim</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {inova.map((c) => (
                    <tr key={`${c.mes}|${c.lojaNome}`} className="hover:bg-blue-50/40">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{c.mes}</td>
                      <td className="px-4 py-3 text-gray-800">{c.lojaNome}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatBRL(c.ciclo1)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatBRL(c.ciclo2)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatBRL(c.ciclo3)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-600">{formatBRL(c.ciclo1 + c.ciclo2 + c.ciclo3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
