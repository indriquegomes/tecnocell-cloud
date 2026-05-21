import { createClient } from '@/lib/supabase/server'
import { abrirCaixa, fecharCaixa } from './actions'
import Link from 'next/link'

export default async function OperacaoPDVPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const supabase = await createClient()

  const { data: caixaAberto } = await supabase
    .from('caixas')
    .select('*')
    .eq('status', 'aberto')
    .order('aberto_em', { ascending: false })
    .limit(1)
    .single()

  const { data: historico } = await supabase
    .from('caixas')
    .select('*')
    .order('aberto_em', { ascending: false })
    .limit(20)

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/pdv" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Operação do PDV</h2>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {/* Status atual */}
      <div className={`rounded-2xl border p-6 ${caixaAberto ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Status do Caixa</p>
            <p className={`text-2xl font-bold mt-1 ${caixaAberto ? 'text-green-700' : 'text-gray-500'}`}>
              {caixaAberto ? 'Aberto' : 'Fechado'}
            </p>
            {caixaAberto && (
              <p className="text-sm text-gray-500 mt-1">
                Aberto em {fmtDate(caixaAberto.aberto_em)} · Saldo inicial: {fmt(caixaAberto.valor_abertura)}
              </p>
            )}
          </div>
          <div className={`h-4 w-4 rounded-full ${caixaAberto ? 'bg-green-500' : 'bg-gray-300'}`} />
        </div>
      </div>

      {/* Ação */}
      {!caixaAberto ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">Abrir Caixa</h3>
          <form action={abrirCaixa} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor de Abertura (R$)</label>
              <input name="valor_abertura" type="number" step="0.01" min="0" defaultValue="0" className="field" />
            </div>
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
              <input name="obs_abertura" className="field" placeholder="Opcional" />
            </div>
            <button type="submit"
              className="rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition">
              Abrir Caixa
            </button>
          </form>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">Fechar Caixa</h3>
          <form action={fecharCaixa.bind(null, caixaAberto.id)} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor de Fechamento (R$)</label>
              <input name="valor_fechamento" type="number" step="0.01" min="0" defaultValue="0" className="field" />
            </div>
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
              <input name="obs_fechamento" className="field" placeholder="Opcional" />
            </div>
            <button type="submit"
              className="rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition">
              Fechar Caixa
            </button>
          </form>
        </div>
      )}

      {/* Histórico */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Histórico de Caixas</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Abertura</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fechamento</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Inicial</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Final</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(historico ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(c.aberto_em)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{c.fechado_em ? fmtDate(c.fechado_em) : '—'}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(c.valor_abertura ?? 0)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{c.valor_fechamento != null ? fmt(c.valor_fechamento) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.status === 'aberto' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
