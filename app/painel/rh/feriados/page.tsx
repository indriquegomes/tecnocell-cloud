import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { criarFeriado, excluirFeriado } from './actions'
import { BotaoExcluir } from '@/components/ui/botao-excluir'

const CIDADE_LABEL: Record<string, string> = { todas: 'Nacional (todas)', petropolis: 'Petrópolis', teresopolis: 'Teresópolis' }
const fmtD = (d: string) => d.split('-').reverse().join('/')

type Feriado = { id: string; cidade: string; data: string; nome: string; tipo: string }

export default async function FeriadosPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams
  const s = await createServiceClient()
  const { data: feriados } = await s.from('feriados').select('id, cidade, data, nome, tipo').order('data')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/painel/rh" className="text-gray-400 hover:text-gray-600">← RH</Link>
        <h2 className="text-2xl font-bold text-gray-900">Feriados</h2>
      </div>

      {ok === '1' && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Feriado salvo.</div>}
      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <form action={criarFeriado} className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Cidade</label>
          <select name="cidade" className="field" required>
            <option value="todas">Nacional (todas)</option>
            <option value="petropolis">Petrópolis</option>
            <option value="teresopolis">Teresópolis</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Data</label>
          <input name="data" type="date" className="field" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Nome</label>
          <input name="nome" className="field" placeholder="Ex: Aniversário da cidade" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tipo</label>
          <select name="tipo" className="field">
            <option value="nacional">Nacional (fecha)</option>
            <option value="municipal">Municipal (decide)</option>
          </select>
        </div>
        <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">Salvar feriado</button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Cidade</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Data</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nome</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tipo</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">—</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(feriados ?? []).map((f: Feriado) => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-sm text-gray-700">{CIDADE_LABEL[f.cidade] ?? f.cidade}</td>
                <td className="px-4 py-2.5 text-sm text-gray-600">{fmtD(f.data)}</td>
                <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{f.nome}</td>
                <td className="px-4 py-2.5 text-sm text-gray-500">{f.tipo === 'nacional' ? 'Nacional' : 'Municipal'}</td>
                <td className="px-4 py-2.5 text-right"><BotaoExcluir action={excluirFeriado.bind(null, f.id)} mensagem="Excluir este feriado?" /></td>
              </tr>
            ))}
            {(feriados ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum feriado cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
