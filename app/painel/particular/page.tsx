import Link from 'next/link'
import { createServiceClient, requirePermissao, fetchAll } from '@/lib/supabase/server'
import { formatBRL, formatDate } from '@/lib/utils'
import { hojeSP } from '@/lib/lembretes'

// PARTICULAR DO DONO — as contas da vida dele, pagas com o pró-labore.
//
// A régua é simples e explícita: o pró-labore do mês é o dinheiro reservado; cada
// conta particular paga sai dele; o que sobra é o que ainda pode ser retirado.
// Não é despesa da loja — por isso vive fora do Financeiro, numa aba própria, e só
// o master enxerga.
//
// Reusa `lancamentos` (categoria 'Pró-labore' e 'Particular'): nenhuma tabela nova,
// nenhum cálculo existente muda.
export default async function ParticularPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  await requirePermissao('master')
  const { mes } = await searchParams
  const supabase = await createServiceClient()

  const hoje = hojeSP().data
  const mesAtual = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : hoje.slice(0, 7)
  const [ano, m] = mesAtual.split('-').map(Number)
  const de = `${mesAtual}-01`
  const ate = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`

  const linhas = await fetchAll<{
    id: string; descricao: string | null; valor: number | null; valor_pago: number | null
    status: string | null; categoria: string | null; subcategoria: string | null
    data_vencimento: string | null; data_pagamento: string | null; forma_pagamento: string | null
    loja_id: string | null
  }>((from, to) => supabase
    .from('lancamentos')
    .select('id, descricao, valor, valor_pago, status, categoria, subcategoria, data_vencimento, data_pagamento, forma_pagamento, loja_id')
    .eq('tipo', 'pagar')
    .in('categoria', ['Pró-labore', 'Particular'])
    .gte('data_vencimento', de).lt('data_vencimento', ate)
    .order('data_vencimento').order('id')
    .range(from, to))

  const { data: lojas } = await supabase.from('lojas').select('id, nome')
  const lojaDe = new Map((lojas ?? []).map((l: { id: string; nome: string }) => [l.id, l.nome]))

  // Lançamento cancelado continua na tabela (histórico), mas não entra em nenhuma soma.
  const ativas = linhas.filter((l) => l.status !== 'cancelado')
  const proLabore = ativas.filter((l) => l.categoria === 'Pró-labore')
  const particular = ativas.filter((l) => l.categoria === 'Particular')
  const soma = (xs: typeof linhas, soPagas = false) =>
    Math.round(xs.filter((l) => !soPagas || l.status === 'pago').reduce((t, l) => t + Number(l.valor ?? 0), 0) * 100) / 100

  const proLaborePrevisto = soma(proLabore)
  const proLaborePago = soma(proLabore, true)
  const particularPago = soma(particular, true)
  const particularPendente = Math.round((soma(particular) - particularPago) * 100) / 100
  const sobra = Math.round((proLaborePrevisto - particularPago) * 100) / 100

  const nomeMes = new Date(`${mesAtual}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
  const mesAnterior = m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`
  const mesSeguinte = m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, '0')}`

  const cartao = (rotulo: string, valor: number, cor: string, ajuda?: string) => (
    <div className={`rounded-2xl border p-4 ${cor}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold">{formatBRL(valor)}</p>
      {ajuda && <p className="mt-1 text-[11px] opacity-70">{ajuda}</p>}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📄 Particular do Dono</h2>
          <p className="text-sm text-gray-500">
            Suas contas pagas com o pró-labore — o que sobra é o que dá para retirar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/painel/particular?mes=${mesAnterior}`} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">← mês anterior</Link>
          <span className="text-sm font-semibold capitalize text-gray-700">{nomeMes}</span>
          <Link href={`/painel/particular?mes=${mesSeguinte}`} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">mês seguinte →</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cartao('Pró-labore do mês', proLaborePrevisto, 'border-blue-200 bg-blue-50 text-blue-900', proLaborePago > 0 ? `${formatBRL(proLaborePago)} já recebido` : 'ainda não recebido')}
        {cartao('Contas particulares pagas', particularPago, 'border-amber-200 bg-amber-50 text-amber-900', particularPendente > 0 ? `${formatBRL(particularPendente)} ainda a pagar` : 'nada pendente')}
        {cartao('Sobra para retirar', sobra, sobra < 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800', 'pró-labore − contas pagas')}
        {cartao('Contas a pagar (pendente)', particularPendente, 'border-gray-200 bg-white text-gray-800', 'vencem no mês')}
      </div>

      {proLaborePrevisto <= 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          Nenhum pró-labore lançado neste mês. O combinado é <b>R$ 4.000,00 Petrópolis + R$ 2.000,00 Teresópolis</b>, vencimento dia 30.
          {' '}
          <Link className="font-semibold underline" href="/painel/financeiro/novo?tipo=pagar&categoria=Pr%C3%B3-labore">Lançar agora</Link>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-800">Contas do mês</h3>
          <Link
            href="/painel/financeiro/novo?tipo=pagar&categoria=Particular"
            className="rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Nova conta particular
          </Link>
        </div>
        {linhas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">
            Nada lançado neste mês. Use “+ Nova conta particular” para registrar conta da casa, escola, carro, saúde…
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-2">Vencimento</th>
                  <th className="px-3 py-2">O que é</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Loja</th>
                  <th className="px-3 py-2">Forma</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-5 py-2 text-right">Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-2 text-gray-600">{l.data_vencimento ? formatDate(l.data_vencimento) : '—'}</td>
                    <td className="px-3 py-2 text-gray-800">{l.descricao ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{l.categoria === 'Pró-labore' ? 'Pró-labore' : (l.subcategoria ?? 'Particular')}</td>
                    <td className="px-3 py-2 text-gray-600">{lojaDe.get(l.loja_id ?? '') ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{l.forma_pagamento ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatBRL(Number(l.valor ?? 0))}</td>
                    <td className="px-5 py-2 text-right">
                      {l.status === 'pago' ? (
                        <span className="rounded-lg bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">pago</span>
                      ) : l.status === 'cancelado' ? (
                        <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">cancelado</span>
                      ) : (
                        <span className="rounded-lg bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">a pagar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Pró-labore é o dinheiro reservado para você; conta particular é onde ele foi gasto. Nada aqui é despesa da loja —
        para a loja, o custo é o pró-labore. O que sobrar você retira e registra como “Retirada do sócio”.
      </p>
    </div>
  )
}
