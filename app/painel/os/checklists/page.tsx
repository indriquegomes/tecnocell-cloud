import { createServiceClient } from '@/lib/supabase/server'
import { ChecklistsForm } from './ChecklistsForm'
import { deletarChecklist } from './actions'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { IconClipboard } from '@/components/icons'
import { Dica } from '@/components/Dica'
import Link from 'next/link'

type Modelo = { id: string; nome: string; itens: string[]; ativo: boolean }

export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string; erro?: string }>
}) {
  const { editar, erro } = await searchParams
  const supabase = await createServiceClient()
  const { data } = await supabase.from('checklists_modelo')
    .select('id, nome, itens, ativo').eq('ativo', true).order('created_at', { ascending: false })
  const modelos = (data ?? []).map((m) => ({ ...m, itens: (m.itens ?? []) as string[] })) as Modelo[]
  const editando = editar ? modelos.find((m) => m.id === editar) : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/os" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <IconClipboard className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Check-lists</h2>
        <Dica texto="Modelos de verificação do aparelho (entrada, saída, etc.). Crie vários — depois cada Ordem de Serviço pode usar um." />
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <ChecklistsForm editando={editando ? { id: editando.id, nome: editando.nome, itens: editando.itens } : undefined} />

      <div className="space-y-3">
        {modelos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            Nenhum check-list ainda. Crie o primeiro acima.
          </p>
        ) : modelos.map((m) => (
          <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="min-w-0">
              <p className="font-semibold text-gray-800">{m.nome} <span className="text-xs font-normal text-gray-400">· {m.itens.length} {m.itens.length === 1 ? 'item' : 'itens'}</span></p>
              {m.itens.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                  {m.itens.slice(0, 8).map((it, i) => <li key={i}>☐ {it}</li>)}
                  {m.itens.length > 8 && <li className="text-gray-400">+{m.itens.length - 8}</li>}
                </ul>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Link href={`/painel/os/checklists?editar=${m.id}`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">Editar</Link>
              <BotaoExcluir action={deletarChecklist.bind(null, m.id)} mensagem={`Excluir o check-list "${m.nome}"?`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
