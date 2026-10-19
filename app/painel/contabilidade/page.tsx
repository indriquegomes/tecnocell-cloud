import { createServiceClient, permissoesUsuarioAtual } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatBRL } from '@/lib/utils'
import { Dica } from '@/components/Dica'
import { buscarDadosContabilidade } from '@/lib/contabilidade'

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (mes: string) => {
  const [ano, m] = mes.split('-').map(Number)
  return NOMES_MES[m - 1] + '/' + ano
}
const fmt = (v: number) => formatBRL(v)

export default async function ContabilidadePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { isMaster } = await permissoesUsuarioAtual()
  if (!isMaster) redirect('/painel/meu-perfil')

  const params = await searchParams
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const pedido = params.mes ?? hoje.slice(0, 7)
  const mes = /^d{4}-d{2}$/.test(pedido) ? pedido : hoje.slice(0, 7)
  const [ano, m] = mes.split('-').map(Number)
  const mesAnterior = m === 1 ? (ano - 1) + '-12' : ano + '-' + String(m - 1).padStart(2, '0')
  const mesSeguinte = m === 12 ? (ano + 1) + '-01' : ano + '-' + String(m + 1).padStart(2, '0')

  const d = await buscarDadosContabilidade(mes)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">🧾 Contabilidade</h2>
        <Dica texto="Resumo do mês pra contadora: faturamento, compras, despesas, folha e resultado. Baixe a planilha no fim." />
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <a href={'/painel/contabilidade?mes=' + mesAnterior} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">← Anterior</a>
        <input type="month" name="mes" defaultValue={mes} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Filtrar</button>
        <a href={'/painel/contabilidade?mes=' + mesSeguinte} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Próximo →</a>
        <a href={'/painel/contabilidade/exportar?mes=' + mes} className="ml-auto rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition">⬇ Baixar planilha (contadora)</a>
      </form>

      <p className="text-sm font-semibold text-gray-500">Mês de {nomeMes(mes)}</p>

      {/* DRE simplificado */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-emerald-700">Faturamento bruto</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{fmt(d.faturamento)}</p>
          <p className="text-[11px] text-emerald-600">vendas do mês · descontos {fmt(d.descontos)}</p>
        </div>
        <div className="rounded-2xl bg-red-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-red-700">Compras</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{fmt(d.compras)}</p>
          <p className="text-[11px] text-red-600">notas de entrada</p>
        </div>
        <div className="rounded-2xl bg-orange-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-orange-700">Despesas pagas</p>
          <p className="mt-1 text-2xl font-bold text-orange-700">{fmt(d.despesasTotal)}</p>
          <p className="text-[11px] text-orange-600">pagar quitado no mês</p>
        </div>
        <div className="rounded-2xl bg-purple-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-purple-700">Folha</p>
          <p className="mt-1 text-2xl font-bold text-purple-700">{fmt(d.folha)}</p>
          <p className="text-[11px] text-purple-600">salários ativos</p>
        </div>
        <div className={'rounded-2xl p-4 shadow-sm ' + (d.resultado >= 0 ? 'bg-emerald-100' : 'bg-amber-100')}>
          <p className="text-xs font-semibold uppercase text-gray-600">{d.resultado >= 0 ? 'Resultado' : 'Resultado'}</p>
          <p className={'mt-1 text-2xl font-bold ' + (d.resultado >= 0 ? 'text-emerald-700' : 'text-amber-700')}>{fmt(d.resultado)}</p>
          <p className="text-[11px] text-gray-500">bruto − descontos − compras − despesas − folha</p>
        </div>
      </div>

      {/* Despesas por categoria */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <p className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700">Despesas por categoria</p>
        <table className="min-w-full divide-y divide-gray-100">
          <tbody className="divide-y divide-gray-50">
            {d.porCategoria.length === 0 && <tr><td className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma despesa paga neste mês.</td></tr>}
            {d.porCategoria.map((c) => (
              <tr key={c.categoria} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm text-gray-700">{c.categoria}</td>
                <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notas de entrada */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <p className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700">Compras (notas de entrada)</p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Data</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Número</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Fornecedor</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.notas.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma nota de entrada neste mês.</td></tr>}
              {d.notas.map((n, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm tabular-nums text-gray-600">{n.data}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{n.numero}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{n.fornecedor}</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(n.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Folha */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <p className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700">Folha de pagamento (salários ativos)</p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Nome</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Cargo</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Salário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.folhaLista.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-400">Nenhum salário cadastrado.</td></tr>}
              {d.folhaLista.map((f, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-700">{f.nome}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{f.cargo}</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(f.salario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] text-gray-400">Encargos (FGTS, INSS, 13º, férias) variam pelo vínculo de cada um — a contadora calcula pelo regime.</p>
      </div>

      {/* Faturamento por dia */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <p className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700">Faturamento por dia</p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Dia</th>
                <th className="px-4 py-2 text-center text-xs font-semibold uppercase text-gray-500">Vendas</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.porDia.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma venda neste mês.</td></tr>}
              {d.porDia.map((x) => (
                <tr key={x.dia} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm tabular-nums text-gray-600">{x.dia.split('-').reverse().join('/')}</td>
                  <td className="px-4 py-2 text-center text-sm tabular-nums text-gray-600">{x.qtd}</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(x.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
