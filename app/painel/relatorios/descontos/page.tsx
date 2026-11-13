import Link from 'next/link'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { buscarDescontosConcedidos } from '@/lib/descontos'
import { formatBRL } from '@/lib/utils'
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

// DESCONTO NA VENDA — o que foi abatido na hora da compra, por vendedora.
//
// São duas coisas diferentes e por isso duas telas:
//   · aqui: desconto no PREÇO, dado durante a venda. A venda já nasce menor, então
//     o faturamento do mês já está certo — o que falta é visibilidade de quem dá;
//   · Fiados → Descontos concedidos: desconto em DÍVIDA já existente, que vira
//     lançamento no resultado.
// Somar as duas dá o quanto a loja abriu mão no mês.
export default async function DescontoNaVendaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const { mes: mesPedido } = await searchParams
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const mes = mesPedido && /^\d{4}-\d{2}$/.test(mesPedido) ? mesPedido : hoje.slice(0, 7)
  const inicio = `${mes}-01T00:00:00-03:00`
  const fim = `${mesSeguinte(mes)}-01T00:00:00-03:00`

  const supabase = await createServiceClient()
  const vendas = await fetchAll<{ id: string; numero: number | null; total: number | null; desconto: number | null; vendedor_nome: string | null }>(
    (from, to) => supabase.from('vendas')
      .select('id, numero, total, desconto, vendedor_nome')
      .eq('status', 'concluida').eq('uso_interno', false).lt('numero', 100000)
      .gte('data', inicio).lt('data', fim)
      .order('id').range(from, to))

  // desconto por PEÇA fica em itens_venda.desconto_item (por unidade) — a venda
  // guarda só o desconto geral em vendas.desconto.
  //
  // UMA consulta, sem fatiar por venda: desconto por peça é raro (974 linhas na
  // tabela inteira contra 77 mil itens, medido em 12/11/2026). Fatiar por venda_id
  // custava uma ida ao banco a cada 200 vendas — 2,7s para trazer 34 linhas.
  const itens = await fetchAll<{ venda_id: string; desconto_item: number | null; quantidade: number | null }>(
    (from, to) => supabase.from('itens_venda')
      .select('venda_id, desconto_item, quantidade')
      .gt('desconto_item', 0)
      .order('id').range(from, to))

  const vendasDoMes = new Set(vendas.map((v) => v.id))
  const pecaPorVenda = new Map<string, number>()
  for (const i of itens) {
    if (!vendasDoMes.has(i.venda_id)) continue
    const v = Number(i.desconto_item ?? 0) * Number(i.quantidade ?? 0)
    pecaPorVenda.set(i.venda_id, (pecaPorVenda.get(i.venda_id) ?? 0) + v)
  }

  type Linha = { vendas: number; geral: number; peca: number; totalVendido: number }
  const porVendedor = new Map<string, Linha>()
  let geralMes = 0, pecaMes = 0, faturamentoMes = 0
  for (const v of vendas) {
    const nome = v.vendedor_nome?.trim() || '(sem vendedor)'
    const geral = Number(v.desconto ?? 0)
    const peca = pecaPorVenda.get(v.id) ?? 0
    const total = Number(v.total ?? 0)
    geralMes += geral
    pecaMes += peca
    faturamentoMes += total
    const atual = porVendedor.get(nome) ?? { vendas: 0, geral: 0, peca: 0, totalVendido: 0 }
    atual.vendas += 1
    atual.geral += geral
    atual.peca += peca
    atual.totalVendido += total
    porVendedor.set(nome, atual)
  }
  const linhas = [...porVendedor.entries()]
    .map(([nome, l]) => ({ nome, ...l, desconto: l.geral + l.peca }))
    .sort((a, b) => b.desconto - a.desconto)

  const descontoVendaMes = geralMes + pecaMes
  // desconto em DÍVIDA do mesmo mês (a outra tela), para fechar a conta do mês
  const emDivida = (await buscarDescontosConcedidos(supabase))
    .filter((d) => d.data.startsWith(mes))
    .reduce((s, d) => s + d.valor, 0)
  const abriuMao = descontoVendaMes + emDivida
  const pct = (v: number) => (faturamentoMes > 0 ? `${((v / faturamentoMes) * 100).toFixed(2).replace('.', ',')}%` : '—')
  const pctDaLinha = (d: number, vendido: number) => (vendido > 0 ? `${((d / vendido) * 100).toFixed(2).replace('.', ',')}%` : '—')
  const nomeMes = `${NOMES_MES[Number(mes.split('-')[1]) - 1]}/${mes.split('-')[0]}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">🏷 Desconto na venda</h2>
        <Dica texto="Desconto dado no preço, na hora da compra: geral (no fechamento) e por peça. Esta venda já nasce menor, então o faturamento do mês já está certo — a tela serve para ver quem dá e quanto." />
        <Link href="/painel/fiados/descontos" className="ml-auto rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Desconto em dívida →</Link>
      </div>

      <form action="/painel/relatorios/descontos" className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <Link href={`/painel/relatorios/descontos?mes=${mesAnterior(mes)}`} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">←</Link>
        <input type="month" name="mes" defaultValue={mes} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700" />
        <button type="submit" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Ver</button>
        <Link href={`/painel/relatorios/descontos?mes=${mesSeguinte(mes)}`} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">→</Link>
        <span className="ml-auto text-sm font-semibold text-gray-500">{nomeMes}</span>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Desconto na venda</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{formatBRL(descontoVendaMes)}</p>
          <p className="mt-1 text-[11px] text-gray-400">{pct(descontoVendaMes)} do faturamento</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">No fechamento · por peça</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-gray-800">{formatBRL(geralMes)} · {formatBRL(pecaMes)}</p>
          <p className="mt-1 text-[11px] text-gray-400">geral · peça</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-amber-700">Desconto em dívida</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-amber-700">{formatBRL(emDivida)}</p>
          <p className="mt-1 text-[11px] text-amber-600">fiado cobrado com abatimento</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-700">Total que a loja abriu mão</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-rose-700">{formatBRL(abriuMao)}</p>
          <p className="mt-1 text-[11px] text-rose-600">venda + dívida no mês</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vendedor</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Vendas</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Vendeu</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Desconto fechamento</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Desconto peça</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Total</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">% do que vendeu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map((l) => (
              <tr key={l.nome} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{l.nome}</td>
                <td className="px-4 py-3 text-center text-sm tabular-nums text-gray-500">{l.vendas}</td>
                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-600">{formatBRL(l.totalVendido)}</td>
                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-600">{l.geral ? formatBRL(l.geral) : '—'}</td>
                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-600">{l.peca ? formatBRL(l.peca) : '—'}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-900">{formatBRL(l.desconto)}</td>
                <td className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${l.totalVendido > 0 && l.desconto / l.totalVendido >= 0.03 ? 'text-rose-600' : 'text-gray-600'}`}>{pctDaLinha(l.desconto, l.totalVendido)}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma venda em {nomeMes}.</td></tr>
            )}
          </tbody>
          {linhas.length > 0 && (
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-4 py-3 text-sm font-bold text-gray-800">Total</td>
                <td className="px-4 py-3 text-center text-sm font-bold tabular-nums text-gray-700">{vendas.length}</td>
                <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-800">{formatBRL(faturamentoMes)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-800">{formatBRL(geralMes)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-800">{formatBRL(pecaMes)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-900">{formatBRL(descontoVendaMes)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-700">{pct(descontoVendaMes)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 space-y-1">
        <p><b>Desconto fechamento</b> é o campo "Desconto ao fechar" da venda; <b>desconto peça</b> é o abatimento dado na linha do produto (R$ ou %). Os dois já estão embutidos no total da venda — o faturamento do mês não muda por causa deles.</p>
        <p><b>Desconto em dívida</b> é outra coisa: cliente devia de uma venda antiga e recebeu abatimento na cobrança. Esse é o único que vira lançamento no resultado (ver Fiados → Descontos concedidos).</p>
        <p>Linha acima de 3% do que a pessoa vendeu aparece em vermelho — é olhata, não regra. Quem decide o limite é o dono.</p>
      </div>
    </div>
  )
}
