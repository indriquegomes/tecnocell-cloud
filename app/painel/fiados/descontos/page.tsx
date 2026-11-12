import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { buscarDescontosConcedidos } from '@/lib/descontos'
import { formatBRL, formatDate } from '@/lib/utils'
import { Dica } from '@/components/Dica'

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const mesAnterior = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}
const mesSeguinte = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

// DESCONTOS CONCEDIDOS — quanto de dívida foi perdoado, por mês e por pessoa.
//
// Não paga nem desconta nada: mostra o que já aconteceu. O valor perdoado não vira
// despesa no Financeiro (o app não trata desconto como pagamento), então sem esta
// tela ele simplesmente some da vista.
export default async function DescontosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const { mes: mesPedido } = await searchParams
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const mesAtual = hoje.slice(0, 7)
  const mes = mesPedido && /^\d{4}-\d{2}$/.test(mesPedido) ? mesPedido : mesAtual

  const supabase = await createServiceClient()
  const [descontos, lojasRes] = await Promise.all([
    buscarDescontosConcedidos(supabase),
    supabase.from('lojas').select('id, nome'),
  ])
  const nomeLoja = new Map(((lojasRes.data ?? []) as { id: string; nome: string }[]).map((l) => [l.id, l.nome]))

  const doMes = descontos.filter((d) => d.data.startsWith(mes))
  const total = doMes.reduce((s, d) => s + d.valor, 0)

  // por pessoa
  const porPessoa = new Map<string, { valor: number; qtd: number }>()
  for (const d of doMes) {
    const at = porPessoa.get(d.pessoa) ?? { valor: 0, qtd: 0 }
    at.valor += d.valor
    at.qtd += 1
    porPessoa.set(d.pessoa, at)
  }
  const pessoas = [...porPessoa.entries()].sort((a, b) => b[1].valor - a[1].valor)

  // total geral (todo o histórico), pra dar dimensão
  const totalGeral = descontos.reduce((s, d) => s + d.valor, 0)

  const nomeMes = `${NOMES_MES[Number(mes.split('-')[1]) - 1]}/${mes.split('-')[0]}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">🏷 Descontos concedidos</h2>
        <Dica texto="Dívida que foi perdoada (desconto no fiado). Não é pagamento e não entra como despesa: por isso só aparece aqui, com data e pessoa." />
        <Link href="/painel/fiados" className="ml-auto rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">← Fiados</Link>
      </div>

      <form action="/painel/fiados/descontos" className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <Link href={`/painel/fiados/descontos?mes=${mesAnterior(mes)}`} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">←</Link>
        <input type="month" name="mes" defaultValue={mes} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700" />
        <button type="submit" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Ver</button>
        <Link href={`/painel/fiados/descontos?mes=${mesSeguinte(mes)}`} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">→</Link>
        <span className="ml-auto text-sm font-semibold text-gray-500">{nomeMes}</span>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className={`rounded-2xl border p-5 shadow-sm ${total > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
          <p className={`text-sm font-medium ${total > 0 ? 'text-amber-700' : 'text-gray-600'}`}>Perdoado em {nomeMes}</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${total > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{formatBRL(total)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Descontos no mês</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{doMes.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Perdoado desde o começo</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{formatBRL(totalGeral)}</p>
        </div>
      </div>

      {pessoas.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Pessoa</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Descontos</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Perdoado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pessoas.map(([pessoa, v]) => (
                <tr key={pessoa} className="hover:bg-blue-50/60 transition">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{pessoa}</td>
                  <td className="px-4 py-3 text-center text-sm tabular-nums text-gray-500">{v.qtd}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-amber-700">{formatBRL(v.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Dia</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Pessoa</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Dívida</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Loja</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Perdoado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {doMes.sort((a, b) => b.data.localeCompare(a.data)).map((d, i) => (
              <tr key={`${d.lancamento_id}-${i}`} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm tabular-nums text-gray-600">{d.data ? formatDate(d.data) : '—'}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{d.pessoa}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{d.descricao}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-500">{d.loja_id ? (nomeLoja.get(d.loja_id) ?? '—') : '—'}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-800">{formatBRL(d.valor)}</td>
              </tr>
            ))}
            {doMes.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">Nenhum desconto concedido em {nomeMes}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
