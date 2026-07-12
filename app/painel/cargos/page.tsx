import { IconShield } from '@/components/icons'
import { createServiceClient } from '@/lib/supabase/server'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { TODAS_PERMISSOES } from '@/lib/permissoes'
import { deletarCargo } from './actions'
import { CargoForm, type CargoEdit } from './CargoForm'
import { Dica } from '@/components/Dica'
import Link from 'next/link'

export default async function CargosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; editar?: string }>
}) {
  const { erro, editar } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: cargosData }, { data: perfis }] = await Promise.all([
    supabase.from('cargos').select('id, nome, permissoes, is_master, ativo').order('nome'),
    supabase.from('perfis').select('cargo_id'),
  ])
  const cargos = (cargosData ?? []) as CargoEdit[]
  const qtdUsuarios: Record<string, number> = {}
  for (const p of (perfis ?? []) as { cargo_id: string | null }[]) {
    if (p.cargo_id) qtdUsuarios[p.cargo_id] = (qtdUsuarios[p.cargo_id] ?? 0) + 1
  }
  const label = (k: string) => TODAS_PERMISSOES.find((p) => p.key === k)?.label ?? k
  const editando = editar ? cargos.find((c) => c.id === editar) : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconShield className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Cargos</h2>
        <Dica texto="Modelo Discord: cada cargo tem um conjunto de permissões. Mudou o cargo, muda pra todo mundo que tem ele. No usuário, você só escolhe o cargo." />
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <CargoForm editando={editando} />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cargo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Permissões</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Usuários</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {cargos.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum cargo. Crie o primeiro acima.</td></tr>
            ) : cargos.map((c) => (
              <tr key={c.id} className={`hover:bg-blue-50/60 transition ${!c.ativo ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">
                  {c.nome}{!c.ativo && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">inativo</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {c.is_master ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">Acesso total</span>
                    : (c.permissoes.length ? c.permissoes.slice(0, 4).map(label).join(', ') + (c.permissoes.length > 4 ? ` +${c.permissoes.length - 4}` : '') : '—')}
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">{qtdUsuarios[c.id] ?? 0}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/cargos?editar=${c.id}`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">Editar</Link>
                    <BotaoExcluir action={deletarCargo.bind(null, c.id)} mensagem={`Excluir o cargo "${c.nome}"?`} />
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
