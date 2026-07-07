import { createServiceClient } from '@/lib/supabase/server'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { deletarMaquina, inativarMaquina, reativarMaquina } from './actions'
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

      {(maquinas ?? []).length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-400 shadow-sm">
          Nenhuma máquina cadastrada ainda. Use o formulário acima pra adicionar a primeira.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(maquinas ?? []).map((m) => {
            const taxas = (m.taxas_credito as number[]) ?? []
            const fmt = (n: number) => `${String(n).replace('.', ',')}%`
            return (
              <div key={m.id} className={`rounded-2xl border bg-white p-5 shadow-sm transition ${m.ativo ? 'border-gray-200' : 'border-gray-200 opacity-70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1B6CA8]/10 text-lg">💳</span>
                    <div>
                      <h3 className="text-base font-bold leading-tight text-gray-900">{m.nome}</h3>
                      <span className={`text-xs font-medium ${m.ativo ? 'text-emerald-600' : 'text-gray-400'}`}>{m.ativo ? 'Ativa' : 'Inativa'} · até {m.max_parcelas}x</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link href={`/painel/maquinas-cartao?editar=${m.id}`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-[#1B6CA8] hover:bg-[#1B6CA8]/10 transition">Editar</Link>
                    {m.ativo ? (
                      <form action={inativarMaquina.bind(null, m.id)}><button type="submit" className="rounded-lg px-2.5 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 transition">Inativar</button></form>
                    ) : (
                      <form action={reativarMaquina.bind(null, m.id)}><button type="submit" className="rounded-lg px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition">Reativar</button></form>
                    )}
                    <BotaoExcluir action={deletarMaquina.bind(null, m.id)} mensagem="Excluir esta máquina? (só se não estiver em uso)" />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-stretch gap-2">
                  <div className="flex flex-col justify-center rounded-xl bg-[#1B6CA8] px-3 py-2 text-white">
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Débito</span>
                    <span className="text-sm font-bold tabular-nums">{fmt(m.taxa_debito)}</span>
                  </div>
                  {taxas.map((t, i) => (
                    <div key={i} className={`flex flex-col justify-center rounded-xl border px-3 py-2 text-center ${t > 0 ? 'border-gray-200 bg-gray-50' : 'border-dashed border-gray-200 bg-white'}`}>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{i + 1}x</span>
                      <span className={`text-sm font-bold tabular-nums ${t > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{t > 0 ? fmt(t) : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
