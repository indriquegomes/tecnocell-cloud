import { createClient } from '@/lib/supabase/server'
import { criarVale, cancelarVale } from './actions'

export default async function ValesCreditoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>
}) {
  const { erro, ok } = await searchParams
  const supabase = await createClient()

  const [{ data: vales }, { data: pessoas }] = await Promise.all([
    supabase
      .from('vales_credito')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('pessoas')
      .select('id, nome')
      .order('nome'),
  ])

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

  const pessoaMap = Object.fromEntries((pessoas ?? []).map((p) => [p.id, p.nome]))

  const totalAtivo = (vales ?? [])
    .filter((v) => v.status === 'ativo')
    .reduce((s, v) => s + (v.saldo ?? 0), 0)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Vales de Crédito</h2>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
      {ok && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Vale criado com sucesso!</div>}

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Saldo Total em Vales</p>
          <p className="text-xl font-bold text-blue-600">{fmt(totalAtivo)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Vales Ativos</p>
          <p className="text-xl font-bold text-gray-800">
            {(vales ?? []).filter((v) => v.status === 'ativo').length}
          </p>
        </div>
      </div>

      {/* Novo Vale */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800">Emitir Novo Vale</h3>
        <form action={criarVale} className="grid gap-4 sm:grid-cols-3 items-end">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cliente</label>
            <select name="pessoa_id" className="field">
              <option value="">Sem vínculo</option>
              {(pessoas ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor (R$)</label>
            <input name="valor" type="number" step="0.01" min="0.01" required className="field" placeholder="0,00" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Motivo</label>
            <input name="motivo" className="field" placeholder="Ex: Devolução, troca..." />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit"
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
              Emitir Vale
            </button>
          </div>
        </form>
      </div>

      {/* Listagem */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Motivo</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Valor</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Emitido</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(vales ?? []).length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum vale emitido.</td></tr>
            ) : (vales ?? []).map((v) => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-800">{v.pessoa_id ? (pessoaMap[v.pessoa_id] ?? '—') : '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{v.motivo || '—'}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(v.valor ?? 0)}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">{fmt(v.saldo ?? 0)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(v.created_at)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${v.status === 'ativo' ? 'bg-green-100 text-green-700' : v.status === 'usado' ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-600'}`}>
                    {v.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {v.status === 'ativo' && (
                    <form action={cancelarVale.bind(null, v.id)}>
                      <button type="submit"
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                        onClick={(e) => { if (!confirm('Cancelar este vale?')) e.preventDefault() }}>
                        Cancelar
                      </button>
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
