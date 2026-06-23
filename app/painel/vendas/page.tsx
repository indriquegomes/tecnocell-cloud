import { createServiceClient } from '@/lib/supabase/server'

export default async function PainelVendasPage() {
  const supabase = await createServiceClient()

  const hoje = new Date().toISOString().split('T')[0]
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const [{ data: vendasHoje }, { data: vendasMes }] = await Promise.all([
    supabase.from('vendas').select('total').eq('status', 'concluida').gte('created_at', hoje),
    supabase.from('vendas').select('total, created_at').eq('status', 'concluida').gte('created_at', inicioMes).order('created_at', { ascending: false }),
  ])

  const totalHoje = (vendasHoje ?? []).reduce((s, v) => s + (v.total ?? 0), 0)
  const totalMes = (vendasMes ?? []).reduce((s, v) => s + (v.total ?? 0), 0)
  const qtdHoje = vendasHoje?.length ?? 0
  const qtdMes = vendasMes?.length ?? 0

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Painel de Vendas</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Vendas hoje', valor: fmt(totalHoje), sub: `${qtdHoje} venda${qtdHoje !== 1 ? 's' : ''}`, cor: 'text-green-600' },
          { label: 'Vendas no mês', valor: fmt(totalMes), sub: `${qtdMes} venda${qtdMes !== 1 ? 's' : ''}`, cor: 'text-blue-600' },
          { label: 'Ticket médio (mês)', valor: qtdMes > 0 ? fmt(totalMes / qtdMes) : 'R$ 0,00', sub: 'por venda', cor: 'text-gray-800' },
          { label: 'Vendas pendentes', valor: '—', sub: 'em breve', cor: 'text-gray-400' },
        ].map(({ label, valor, sub, cor }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${cor}`}>{valor}</p>
            <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="font-semibold text-gray-800">Últimas vendas do mês</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(vendasMes ?? []).slice(0, 20).length === 0 ? (
              <tr><td colSpan={2} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma venda este mês.</td></tr>
            ) : (vendasMes ?? []).slice(0, 20).map((v, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(v.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{fmt(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-400">
          Próximas features: ranking de produtos, vendas por vendedor, metas, gráficos por período.
        </p>
      </div>
    </div>
  )
}
