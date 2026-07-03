import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { formatDate } from '@/lib/utils'
import { ExportCsv } from './ExportCsv'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type ItemVenda = {
  quantidade: number
  preco_unitario: number
  total_item: number
  produto_id: string
  produtos: { nome: string; preco_custo: number | null } | null
  vendas: { created_at: string; status: string; pessoa_id: string | null } | null
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; de?: string; ate?: string }>
}) {
  const { aba = 'financeiro', de, ate } = await searchParams
  const supabase = await createServiceClient()

  const hoje = new Date().toISOString().split('T')[0]
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dataInicio = de ?? inicioMes
  const dataFim = ate ?? hoje
  const periodo = { inicio: dataInicio + 'T00:00:00', fim: dataFim + 'T23:59:59' }

  // ---------- Financeiro ----------
  let lancamentos: { tipo: string; status: string; valor: number; data_vencimento: string; descricao: string; pessoa_nome: string }[] = []
  if (aba === 'financeiro') {
    const { data } = await supabase
      .from('lancamentos')
      .select('tipo, status, valor, data_vencimento, descricao, pessoa_nome')
      .gte('data_vencimento', dataInicio)
      .lte('data_vencimento', dataFim + 'T23:59:59')
      .order('data_vencimento')
    lancamentos = data ?? []
  }

  // ---------- Vendas ----------
  let vendas: { id: string; total: number; desconto: number; created_at: string; status: string }[] = []
  if (aba === 'vendas') {
    const { data } = await supabase
      .from('vendas')
      .select('id, total, desconto, created_at, status')
      .gte('created_at', periodo.inicio)
      .lte('created_at', periodo.fim)
      .order('created_at', { ascending: false })
    vendas = data ?? []
  }

  // ---------- Lucro e Produtos (compartilham os itens de venda do período) ----------
  type ProdAgg = { nome: string; qtd: number; vendido: number; custo: number }
  const porProduto: Record<string, ProdAgg> = {}
  let totalVendidoItens = 0, totalCustoItens = 0
  if (aba === 'lucro' || aba === 'produtos') {
    const { data } = await supabase
      .from('itens_venda')
      .select('quantidade, preco_unitario, total_item, produto_id, produtos(nome, preco_custo), vendas!inner(created_at, status, pessoa_id)')
      .eq('vendas.status', 'concluida')
      .gte('vendas.created_at', periodo.inicio)
      .lte('vendas.created_at', periodo.fim)
    for (const it of (data ?? []) as unknown as ItemVenda[]) {
      const nome = it.produtos?.nome ?? '—'
      const custoLinha = (it.produtos?.preco_custo ?? 0) * it.quantidade
      const vendidoLinha = it.total_item ?? (it.preco_unitario * it.quantidade)
      if (!porProduto[it.produto_id]) porProduto[it.produto_id] = { nome, qtd: 0, vendido: 0, custo: 0 }
      porProduto[it.produto_id].qtd += it.quantidade
      porProduto[it.produto_id].vendido += vendidoLinha
      porProduto[it.produto_id].custo += custoLinha
      totalVendidoItens += vendidoLinha
      totalCustoItens += custoLinha
    }
  }
  const lucroTotal = totalVendidoItens - totalCustoItens
  const margemTotal = totalVendidoItens > 0 ? (lucroTotal / totalVendidoItens) * 100 : 0
  const rankLucro = Object.values(porProduto)
    .map((p) => ({ ...p, lucro: p.vendido - p.custo, margem: p.vendido > 0 ? ((p.vendido - p.custo) / p.vendido) * 100 : 0 }))
    .sort((a, b) => b.lucro - a.lucro)
  const rankQtd = Object.values(porProduto).slice().sort((a, b) => b.qtd - a.qtd)
  const rankValor = Object.values(porProduto).slice().sort((a, b) => b.vendido - a.vendido)

  // Top clientes (Faturamento por Cliente — referência SIGE)
  type CliAgg = { nome: string; qtd: number; total: number }
  const porCliente: Record<string, CliAgg> = {}
  if (aba === 'produtos') {
    const { data } = await supabase
      .from('vendas')
      .select('total, pessoa_id, pessoas(nome)')
      .eq('status', 'concluida')
      .gte('created_at', periodo.inicio)
      .lte('created_at', periodo.fim)
    for (const v of (data ?? []) as unknown as { total: number; pessoa_id: string | null; pessoas: { nome: string } | null }[]) {
      const key = v.pessoa_id ?? 'sem'
      const nome = v.pessoas?.nome ?? 'Sem cliente'
      if (!porCliente[key]) porCliente[key] = { nome, qtd: 0, total: 0 }
      porCliente[key].qtd++
      porCliente[key].total += v.total ?? 0
    }
  }
  const rankClientes = Object.values(porCliente).sort((a, b) => b.total - a.total)

  // ---------- Estoque (valor a custo + a venda + parados) ----------
  type EstRow = { produto_id: string; nome: string; quantidade: number; deposito: string; preco: number; custo: number }
  let estoque: EstRow[] = []
  let valorCusto = 0, valorVenda = 0
  let parados: EstRow[] = []
  if (aba === 'estoque') {
    const { data } = await supabase
      .from('estoque')
      .select('produto_id, quantidade, produtos(nome, preco, preco_custo), depositos(nome)')
      .gt('quantidade', 0)
      .limit(500)
    estoque = (data ?? []).map((e) => {
      const p = e.produtos as unknown as { nome: string; preco: number; preco_custo: number | null } | null
      return {
        produto_id: e.produto_id,
        nome: p?.nome ?? '—',
        preco: p?.preco ?? 0,
        custo: p?.preco_custo ?? 0,
        quantidade: e.quantidade,
        deposito: (e.depositos as unknown as { nome: string } | null)?.nome ?? '—',
      }
    }).sort((a, b) => b.quantidade * b.custo - a.quantidade * a.custo)
    valorCusto = estoque.reduce((s, e) => s + e.quantidade * e.custo, 0)
    valorVenda = estoque.reduce((s, e) => s + e.quantidade * e.preco, 0)

    // Parados: em estoque mas sem venda nos últimos 60 dias
    const limite = new Date(Date.now() - 60 * 86400000).toISOString()
    const { data: vend60 } = await supabase
      .from('itens_venda')
      .select('produto_id, vendas!inner(created_at, status)')
      .eq('vendas.status', 'concluida')
      .gte('vendas.created_at', limite)
    const vendidos = new Set((vend60 ?? []).map((r) => (r as { produto_id: string }).produto_id))
    parados = estoque.filter((e) => !vendidos.has(e.produto_id))
  }

  const totalReceber = lancamentos.filter((l) => l.tipo === 'receber').reduce((s, l) => s + l.valor, 0)
  const totalPagar = lancamentos.filter((l) => l.tipo === 'pagar').reduce((s, l) => s + l.valor, 0)
  const totalVendas = vendas.reduce((s, v) => s + v.total, 0)

  const abas = [
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'vendas', label: 'Vendas' },
    { id: 'lucro', label: 'Lucro' },
    { id: 'produtos', label: 'Produtos' },
    { id: 'estoque', label: 'Estoque' },
  ]

  const Card = ({ label, valor, cor }: { label: string; valor: string; cor: string }) => (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${cor}`}>{valor}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">Relatórios</h2>
        <Dica texto="Resumos por período: financeiro, vendas, lucro/margem, produtos mais vendidos e valor de estoque. Cada aba exporta CSV." />
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
        {abas.map((a) => (
          <Link key={a.id} href={`/painel/relatorios?aba=${a.id}&de=${dataInicio}&ate=${dataFim}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${aba === a.id ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            {a.label}
          </Link>
        ))}
      </div>

      {/* Filtro de período */}
      <form method="GET" className="flex flex-wrap gap-3 items-end">
        <input type="hidden" name="aba" value={aba} />
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">De</label>
          <input name="de" type="date" defaultValue={dataInicio}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Até</label>
          <input name="ate" type="date" defaultValue={dataFim}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
          Filtrar
        </button>
      </form>

      {/* ---------------- Financeiro ---------------- */}
      {aba === 'financeiro' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="A Receber" valor={fmt(totalReceber)} cor="text-green-600" />
            <Card label="A Pagar" valor={fmt(totalPagar)} cor="text-red-500" />
            <Card label="Saldo" valor={fmt(totalReceber - totalPagar)} cor={totalReceber - totalPagar >= 0 ? 'text-blue-600' : 'text-red-500'} />
          </div>
          <div className="flex justify-end">
            <ExportCsv filename={`financeiro_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'descricao', label: 'Descrição' }, { key: 'pessoa_nome', label: 'Pessoa' }, { key: 'data_vencimento', label: 'Vencimento' }, { key: 'valor', label: 'Valor', money: true }, { key: 'tipo', label: 'Tipo' }, { key: 'status', label: 'Status' }]}
              rows={lancamentos as unknown as Record<string, unknown>[]} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Descrição', 'Pessoa', 'Vencimento', 'Valor', 'Tipo', 'Status'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase ${i === 3 ? 'text-right' : i >= 4 ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lancamentos.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum lançamento no período.</td></tr>
                ) : lancamentos.map((l, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800">{l.descricao || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{l.pessoa_nome || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{l.data_vencimento ? formatDate(l.data_vencimento) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-800">{fmt(l.valor)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${l.tipo === 'receber' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{l.tipo}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${l.status === 'pago' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>{l.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Vendas ---------------- */}
      {aba === 'vendas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="Total Vendido" valor={fmt(totalVendas)} cor="text-blue-600" />
            <Card label="Nº de Vendas" valor={String(vendas.length)} cor="text-gray-800" />
            <Card label="Ticket Médio" valor={vendas.length > 0 ? fmt(totalVendas / vendas.length) : 'R$ 0,00'} cor="text-gray-800" />
          </div>
          <div className="flex justify-end">
            <ExportCsv filename={`vendas_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'created_at', label: 'Data' }, { key: 'total', label: 'Total', money: true }, { key: 'desconto', label: 'Desconto', money: true }, { key: 'status', label: 'Status' }]}
              rows={vendas as unknown as Record<string, unknown>[]} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Desconto</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vendas.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma venda no período.</td></tr>
                ) : vendas.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(v.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(v.total)}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-500">{fmt(v.desconto ?? 0)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">{v.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Lucro ---------------- */}
      {aba === 'lucro' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card label="Vendido" valor={fmt(totalVendidoItens)} cor="text-blue-600" />
            <Card label="Custo" valor={fmt(totalCustoItens)} cor="text-orange-500" />
            <Card label="Lucro" valor={fmt(lucroTotal)} cor={lucroTotal >= 0 ? 'text-green-600' : 'text-red-500'} />
            <Card label="Margem" valor={`${margemTotal.toFixed(1)}%`} cor="text-gray-800" />
          </div>
          <p className="text-[11px] text-gray-400">Custo = preço de custo atual do produto × quantidade vendida (histórico de custo por compra fica pra depois).</p>
          <div className="flex justify-end">
            <ExportCsv filename={`lucro_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'nome', label: 'Produto' }, { key: 'qtd', label: 'Qtd' }, { key: 'vendido', label: 'Vendido', money: true }, { key: 'custo', label: 'Custo', money: true }, { key: 'lucro', label: 'Lucro', money: true }, { key: 'margem', label: 'Margem %' }]}
              rows={rankLucro as unknown as Record<string, unknown>[]} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qtd</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Vendido</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Custo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Lucro</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rankLucro.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Sem vendas concluídas no período.</td></tr>
                ) : rankLucro.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{p.qtd}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(p.vendido)}</td>
                    <td className="px-4 py-3 text-sm text-right text-orange-500">{fmt(p.custo)}</td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold ${p.lucro >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(p.lucro)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{p.margem.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Produtos (mais vendidos + top clientes) ---------------- */}
      {aba === 'produtos' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Mais vendidos (quantidade)</h3>
                <ExportCsv filename={`mais_vendidos_qtd_${dataInicio}_${dataFim}.csv`}
                  cols={[{ key: 'nome', label: 'Produto' }, { key: 'qtd', label: 'Qtd' }, { key: 'vendido', label: 'Valor', money: true }]}
                  rows={rankQtd as unknown as Record<string, unknown>[]} />
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qtd</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Valor</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {rankQtd.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-400">Sem vendas no período.</td></tr>
                    ) : rankQtd.slice(0, 20).map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">{p.qtd}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{fmt(p.vendido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Top clientes (faturamento)</h3>
                <ExportCsv filename={`top_clientes_${dataInicio}_${dataFim}.csv`}
                  cols={[{ key: 'nome', label: 'Cliente' }, { key: 'qtd', label: 'Compras' }, { key: 'total', label: 'Total', money: true }]}
                  rows={rankClientes as unknown as Record<string, unknown>[]} />
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Compras</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {rankClientes.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-400">Sem vendas no período.</td></tr>
                    ) : rankClientes.slice(0, 20).map((c, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.nome}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{c.qtd}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Estoque ---------------- */}
      {aba === 'estoque' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="Investido (a custo)" valor={fmt(valorCusto)} cor="text-orange-600" />
            <Card label="Potencial (a venda)" valor={fmt(valorVenda)} cor="text-green-600" />
            <Card label="Parados (60 dias)" valor={String(parados.length)} cor="text-gray-800" />
          </div>
          <div className="flex justify-end">
            <ExportCsv filename={`estoque_${dataFim}.csv`}
              cols={[{ key: 'nome', label: 'Produto' }, { key: 'deposito', label: 'Depósito' }, { key: 'quantidade', label: 'Qtd' }, { key: 'custo', label: 'Custo Unit', money: true }, { key: 'preco', label: 'Venda Unit', money: true }]}
              rows={estoque as unknown as Record<string, unknown>[]} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Depósito</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qtd</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Custo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {estoque.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">Sem dados de estoque.</td></tr>
                ) : estoque.slice(0, 200).map((e, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{e.nome}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{e.deposito}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{e.quantidade}</td>
                    <td className="px-4 py-3 text-sm text-right text-orange-600">{fmt(e.quantidade * e.custo)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(e.quantidade * e.preco)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
