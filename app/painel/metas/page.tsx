import { createServiceClient } from '@/lib/supabase/server'
import { formatBRL, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { Dica } from '@/components/Dica'
import Link from 'next/link'
import { MetasForm } from './MetasForm'
import { deletarMeta } from './actions'

export default async function MetasPage({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const [{ data: lojas }, { data: metas }, { data: faixas }] = await Promise.all([
    supabase.from('lojas').select('id, nome').order('nome'),
    supabase.from('metas').select('id, loja_id, rotulo, data_inicio, data_fim, dias_uteis, ativo').order('data_inicio', { ascending: false }),
    supabase.from('metas_faixas').select('meta_id, nome, valor, premio, ordem').order('ordem'),
  ])
  const nomeLoja = Object.fromEntries((lojas ?? []).map((l) => [l.id, l.nome]))
  const faixasDe = (id: string) => (faixas ?? []).filter((f) => f.meta_id === id)

  const editando = params.editar ? (metas ?? []).find((m) => m.id === params.editar) : undefined
  const editandoFull = editando
    ? { ...editando, faixas: faixasDe(editando.id).map((f) => ({ nome: f.nome, valor: Number(f.valor), premio: Number(f.premio) })) }
    : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">Metas</h2>
        <Dica texto="Metas de faturamento por loja e período, em faixas com prêmio (aparecem no dashboard das meninas)." />
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {(metas ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
            Nenhuma meta ainda. Crie a primeira abaixo. 🎯
          </p>
        ) : (metas ?? []).map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">{m.rotulo}</span>
                <span className="text-sm text-gray-400">· {nomeLoja[m.loja_id ?? ''] ?? '—'}</span>
                {m.ativo ? <Badge variant="success">ativa</Badge> : <Badge variant="outline">inativa</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                {formatDate(m.data_inicio)} → {formatDate(m.data_fim)} · {m.dias_uteis} dias úteis
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                {faixasDe(m.id).map((f) => (
                  <span key={f.nome}><b className="text-gray-700">{f.nome}</b> {formatBRL(Number(f.valor))} <span className="text-amber-600">🎁{formatBRL(Number(f.premio))}</span></span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link href={`/painel/metas?editar=${m.id}`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">Editar</Link>
              <BotaoExcluir action={deletarMeta.bind(null, m.id)} mensagem={`Excluir a meta "${m.rotulo}" de ${nomeLoja[m.loja_id ?? ''] ?? ''}?`} />
            </div>
          </div>
        ))}
      </div>

      {/* Form */}
      <MetasForm lojas={lojas ?? []} editando={editandoFull} />
    </div>
  )
}
