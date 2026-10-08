'use client'

import { pagarFreelancer } from './actions'
import { formatBRL } from '@/lib/utils'
import { horasTexto } from '@/lib/escala'

type Resumo = { id: string; nome: string; horas: number; valorHora: number; total: number }

export function FreelancersClient({ resumo, erro }: { resumo: Resumo[]; erro?: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">💼 Freelancers (por hora)</h2>
        <p className="mt-0.5 text-sm text-gray-500">Horas não pagas de cada freelancer. Pague e zere o banco dele.</p>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Nome</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Horas</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Valor/hora</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {resumo.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm font-medium text-gray-800">{r.nome}</td>
                <td className="px-4 py-2 text-right text-sm text-gray-600">{horasTexto(Math.round(r.horas * 60))}</td>
                <td className="px-4 py-2 text-right text-sm text-gray-600">{formatBRL(r.valorHora)}</td>
                <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">{formatBRL(r.total)}</td>
                <td className="px-4 py-2 text-right">
                  {r.total > 0.01 ? (
                    <form action={pagarFreelancer} className="inline">
                      <input type="hidden" name="perfil_id" value={r.id} />
                      <input type="hidden" name="nome" value={r.nome} />
                      <input type="hidden" name="horas" value={horasTexto(Math.round(r.horas * 60))} />
                      <input type="hidden" name="valor" value={r.total.toFixed(2)} />
                      <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition">Pagar + zerar</button>
                    </form>
                  ) : (
                    <span className="text-xs text-gray-400">Sem horas</span>
                  )}
                </td>
              </tr>
            ))}
            {resumo.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum freelancer cadastrado. Marque a opção no cadastro do usuário.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
