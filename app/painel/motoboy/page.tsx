import { headers } from 'next/headers'
import { createServiceClient, permissoesUsuarioAtual } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MotoboyClient } from './MotoboyClient'

export type Motoboy = { id: string; nome: string; motoboy_valor_fixo: number | null; motoboy_adicional_loja: number | null; motoboy_adicional_extra: number | null; motoboy_tipo: string | null }
export type Rota = { id: string; perfil_id: string; data: string; loja_id: string | null; entregas: number; extras: number; observacao: string | null; lojas: { nome: string }[] | null }
export type Loja = { id: string; nome: string }

export default async function MotoboyPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const h = await headers()
  const userId = h.get('x-user-id') ?? ''
  const { isMaster } = await permissoesUsuarioAtual()
  if (!userId) redirect('/login')
  const supabase = await createServiceClient()

  const { data: lojas } = await supabase.from('lojas').select('id, nome').eq('ativa', true).order('nome')
  const { data: cargo } = await supabase.from('cargos').select('id').eq('nome', 'MOTOBOY').maybeSingle()

  let motoboys: Motoboy[] = []
  if (cargo?.id) {
    const { data } = await supabase.from('perfis')
      .select('id, nome, motoboy_valor_fixo, motoboy_adicional_loja, motoboy_adicional_extra, motoboy_tipo')
      .eq('cargo_id', cargo.id)
    motoboys = (data ?? []) as Motoboy[]
  }

  let rotas: Rota[] = []
  if (isMaster || motoboys.some((m) => m.id === userId)) {
    let q = supabase.from('rotas_motoboy').select('id, perfil_id, data, loja_id, entregas, extras, observacao, lojas(nome)')
    if (!isMaster) q = q.eq('perfil_id', userId)
    const { data } = await q.order('data', { ascending: false }).limit(500)
    rotas = (data ?? []) as Rota[]
  }

  // Entregas pendentes — relatório diário do motoboy (sem nome de cliente nem valor)
  const { data: entregasRaw } = await supabase.from('vendas')
    .select('id, rota_entrega, horario_entrega, endereco_entrega')
    .eq('tipo_entrega', 'entrega')
    .is('entregue_em', null)
    .order('created_at')
  const entregasList = (entregasRaw ?? []) as { id: string; rota_entrega: string | null; horario_entrega: string | null; endereco_entrega: string | null }[]
  const entregaIds = entregasList.map((v) => v.id)
  const { data: entregaItens } = entregaIds.length
    ? await supabase.from('itens_venda').select('venda_id, quantidade, produtos(nome)').in('venda_id', entregaIds)
    : { data: [] }
  const itensPorEntrega = new Map<string, { nome: string; qtd: number }[]>()
  for (const it of (entregaItens ?? []) as unknown as { venda_id: string; quantidade: number; produtos: { nome: string } | null }[]) {
    const arr = itensPorEntrega.get(it.venda_id) ?? []
    arr.push({ nome: it.produtos?.nome ?? 'Peça', qtd: it.quantidade })
    itensPorEntrega.set(it.venda_id, arr)
  }
  const totalPecas = entregasList.reduce((s, v) => s + (itensPorEntrega.get(v.id) ?? []).reduce((x, i) => x + i.qtd, 0), 0)
  const gruposEntregas = new Map<string, { endereco: string | null; pecas: { nome: string; qtd: number }[] }[]>()
  for (const v of entregasList) {
    const rota = v.rota_entrega ? v.rota_entrega[0].toUpperCase() + v.rota_entrega.slice(1) : 'Sem rota'
    const chave = `${rota} — ${v.horario_entrega || 'sem horário'}`
    ;(gruposEntregas.get(chave) ?? gruposEntregas.set(chave, []).get(chave)!).push({ endereco: v.endereco_entrega, pecas: itensPorEntrega.get(v.id) ?? [] })
  }
  const gruposEntregasOrdenados = [...gruposEntregas.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">🛵 Registro de Rotas</h2>
        <p className="mt-0.5 text-sm text-gray-500">O motoboy registra o dia; o admin vê o total e o pagamento.</p>
      </div>
      {/* Entregas de hoje — relatório diário (sem nome de cliente, sem valor) */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-800">🛵 Entregas de hoje</h3>
          {entregasList.length > 0 && (
            <span className="text-xs font-semibold text-blue-700">{entregasList.length} entrega(s) · {totalPecas} peça(s)</span>
          )}
        </div>
        {entregasList.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Nenhuma entrega pendente. 🎉</p>
        ) : (
          gruposEntregasOrdenados.map(([chave, grupo]) => (
            <div key={chave} className="border-b border-gray-100 last:border-b-0 px-5 py-3">
              <p className="text-sm font-semibold text-gray-700">{chave}</p>
              <div className="mt-1 space-y-1">
                {grupo.map((g, i) => (
                  <div key={i} className="flex flex-wrap gap-x-2 text-sm text-gray-600">
                    <span>{g.endereco ? `📍 ${g.endereco}` : '📍 (sem endereço)'}</span>
                    {g.pecas.length > 0 && <span className="text-gray-400">{g.pecas.map((p) => `${p.qtd}x ${p.nome}`).join(' · ')}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <MotoboyClient motoboys={motoboys} rotas={rotas} lojas={(lojas ?? []) as Loja[]} userId={userId} isMaster={isMaster} erro={erro} />
    </div>
  )
}
