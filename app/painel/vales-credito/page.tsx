import { createServiceClient } from '@/lib/supabase/server'
import { emitirCredito, estornarCredito } from './actions'
import { ConfirmButton } from '@/components/ConfirmButton'

export default async function CreditosClientePage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>
}) {
  const { erro, ok } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: entradas }, { data: pessoas }, { data: todasMovs }] = await Promise.all([
    supabase
      .from('creditos_clientes')
      .select('id, pessoa_id, pessoa_nome, valor, tipo, descricao, created_at')
      .in('tipo', ['credito', 'estorno'])
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('pessoas').select('id, nome').in('tipo', ['cliente', 'ambos']).order('nome'),
    supabase.from('creditos_clientes').select('pessoa_id, pessoa_nome, valor, tipo'),
  ])

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

  const saldoPorPessoa: Record<string, { nome: string; saldo: number }> = {}
  for (const m of todasMovs ?? []) {
    if (!m.pessoa_id) continue
    if (!saldoPorPessoa[m.pessoa_id]) saldoPorPessoa[m.pessoa_id] = { nome: m.pessoa_nome ?? '—', saldo: 0 }
    if (m.tipo === 'uso') saldoPorPessoa[m.pessoa_id].saldo -= m.valor ?? 0
    else saldoPorPessoa[m.pessoa_id].saldo += m.valor ?? 0
  }

  const clientesComSaldo = Object.entries(saldoPorPessoa)
    .filter(([, v]) => v.saldo > 0.01)
    .sort((a, b) => b[1].saldo - a[1].saldo)

  const totalEmCirculacao = clientesComSaldo.reduce((s, [, v]) => s + v.saldo, 0)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Créditos de Clientes</h2>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
      {ok && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Crédito emitido com sucesso!</div>}

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Total em circulação</p>
          <p className="mt-1 text-xl font-bold text-blue-600">{fmt(totalEmCirculacao)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Clientes com saldo</p>
          <p className="mt-1 text-xl font-bold text-gray-800">{clientesComSaldo.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Movimentos</p>
          <p className="mt-1 text-xl font-bold text-gray-800">{(entradas ?? []).length}</p>
        </div>
      </div>

      {/* Saldos por cliente */}
      {clientesComSaldo.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-gray-800">Clientes com saldo disponível</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3 text-right">Saldo disponível</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clientesComSaldo.map(([id, v]) => (
                <tr key={id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{v.nome}</td>
                  <td className="px-5 py-3 text-right font-bold text-green-600">{fmt(v.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Emitir crédito */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800">Emitir Crédito Manual</h3>
        <form action={emitirCredito} className="grid gap-4 sm:grid-cols-3 items-end">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cliente <span className="text-red-500">*</span></label>
            <select name="pessoa_id" required className="field">
              <option value="">Selecione...</option>
              {(pessoas ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor (R$) <span className="text-red-500">*</span></label>
            <input name="valor" type="number" step="0.01" min="0.01" required className="field" placeholder="0,00" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Motivo</label>
            <input name="descricao" className="field" placeholder="Ex: Vale de troca, bônus..." />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit"
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
              Emitir Crédito
            </button>
          </div>
        </form>
      </div>

      {/* Histórico */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="font-semibold text-gray-800">Histórico de Créditos e Estornos</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3">Descrição</th>
              <th className="px-5 py-3 text-center">Tipo</th>
              <th className="px-5 py-3 text-right">Valor</th>
              <th className="px-5 py-3">Data</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(entradas ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">Nenhum movimento registrado.</td></tr>
            ) : (entradas ?? []).map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-800">{e.pessoa_nome ?? '—'}</td>
                <td className="px-5 py-3 text-gray-500">{e.descricao ?? '—'}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    e.tipo === 'credito' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {e.tipo === 'credito' ? '+ Crédito' : '− Estorno'}
                  </span>
                </td>
                <td className={`px-5 py-3 text-right font-semibold ${e.tipo === 'credito' ? 'text-green-600' : 'text-red-500'}`}>
                  {e.tipo === 'credito' ? '+' : '−'}{fmt(e.valor ?? 0)}
                </td>
                <td className="px-5 py-3 text-gray-400">{fmtDate(e.created_at)}</td>
                <td className="px-5 py-3 text-right">
                  {e.tipo === 'credito' && (
                    <form action={estornarCredito.bind(null, e.id)}>
                      <ConfirmButton message="Estornar este crédito?" className="text-xs text-red-500 hover:text-red-700 font-medium">
                        Estornar
                      </ConfirmButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
