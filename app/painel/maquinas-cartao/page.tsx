import { createServiceClient } from '@/lib/supabase/server'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { deletarMaquina } from './actions'
import { MaquinaForm } from './MaquinaForm'
import { Dica } from '@/components/Dica'
import Link from 'next/link'

export default async function MaquinasCartaoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; editar?: string }>
}) {
  const { erro, editar } = await searchParams
  const supabase = await createServiceClient()
  const { data: maquinas } = await supabase
    .from('maquinas_cartao')
    .select('id, nome, taxa_debito, taxas_credito, max_parcelas, ativo')
    .order('nome')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editando = (maquinas ?? []).find((m: any) => m.id === editar) as any

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">Máquinas de Cartão</h2>
        <Dica texto="Cadastre suas maquininhas e as taxas por parcela. O PDV usa essas taxas pra calcular quanto cai de cada venda no cartão. Sem mexer no código." />
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <MaquinaForm maquina={editando} />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Máquina</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Débito</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">1x</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Máx.</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(maquinas ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma máquina cadastrada.</td></tr>
            ) : (maquinas ?? []).map((m) => (
              <tr key={m.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{m.nome}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">{m.taxa_debito}%</td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">{(m.taxas_credito as number[])?.[0] ?? 0}%</td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">{m.max_parcelas}x</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${m.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {m.ativo ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/maquinas-cartao?editar=${m.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                      Editar
                    </Link>
                    <BotaoExcluir action={deletarMaquina.bind(null, m.id)} mensagem="Excluir esta máquina?" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
