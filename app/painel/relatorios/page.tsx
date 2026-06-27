import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

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

  // Financeiro
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

  // Vendas
  let vendas: { id: string; total: number; desconto: number; created_at: string; status: string }[] = []
  if (aba === 'vendas') {
    const { data } = await supabase
      .from('vendas')
      .select('id, total, desconto, created_at, status')
      .gte('created_at', dataInicio)
      .lte('created_at', dataFim + 'T23:59:59')
      .order('created_at', { ascending: false })
    vendas = data ?? []
  }

  // Estoque
  let estoque: { nome: string; quantidade: number; deposito: string; preco: number }[] = []
  if (aba === 'estoque') {
    const { data } = await supabase
      .from('estoque')
      .select('quantidade, produtos(nome, preco), depositos(nome)')
      .order('quantidade', { ascending: false })
      .limit(200)
    estoque = (data ?? []).map((e) => ({
      nome: (e.produtos as unknown as { nome: string; preco: number } | null)?.nome ?? '—',
      preco: (e.produtos as unknown as { nome: string; preco: number } | null)?.preco ?? 0,
      quantidade: e.quantidade,
      deposito: (e.depositos as unknown as { nome: string } | null)?.nome ?? '—',
    }))
  }

  const totalReceber = lancamentos.filter((l) => l.tipo === 'receber').reduce((s, l) => s + l.valor, 0)
  const totalPagar = lancamentos.filter((l) => l.tipo === 'pagar').reduce((s, l) => s + l.valor, 0)
  const totalVendas = vendas.reduce((s, v) => s + v.total, 0)
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const abas = [
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'vendas', label: 'Vendas' },
    { id: 'estoque', label: 'Estoque' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">Relatórios</h2>
        <Dica texto="Resumos e análises por período: financeiro, vendas e estoque. Use as abas para navegar entre os tipos de relatório." />
      </div>

      {/* Abas */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
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

      {/* Financeiro */}
      {aba === 'financeiro' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">A Receber</p>
              <p className="text-xl font-bold text-green-600">{fmt(totalReceber)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">A Pagar</p>
              <p className="text-xl font-bold text-red-500">{fmt(totalPagar)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">Saldo</p>
              <p className={`text-xl font-bold ${totalReceber - totalPagar >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                {fmt(totalReceber - totalPagar)}
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Pessoa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vencimento</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Valor</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lancamentos.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum lançamento no período.</td></tr>
                ) : lancamentos.map((l, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800">{l.descricao || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{l.pessoa_nome || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {l.data_vencimento ? new Date(l.data_vencimento).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-800">{fmt(l.valor)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${l.tipo === 'receber' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {l.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${l.status === 'pago' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vendas */}
      {aba === 'vendas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">Total Vendido</p>
              <p className="text-xl font-bold text-blue-600">{fmt(totalVendas)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">Nº de Vendas</p>
              <p className="text-xl font-bold text-gray-800">{vendas.length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">Ticket Médio</p>
              <p className="text-xl font-bold text-gray-800">{vendas.length > 0 ? fmt(totalVendas / vendas.length) : 'R$ 0,00'}</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
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
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(v.created_at).toLocaleString('pt-BR')}</td>
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

      {/* Estoque */}
      {aba === 'estoque' && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Depósito</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Quantidade</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Unit.</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Valor Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {estoque.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">Sem dados de estoque.</td></tr>
              ) : estoque.map((e, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{e.nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{e.deposito}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{e.quantidade}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{fmt(e.preco)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(e.quantidade * e.preco)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
