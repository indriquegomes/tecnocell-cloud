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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">🛵 Registro de Rotas</h2>
        <p className="mt-0.5 text-sm text-gray-500">O motoboy registra o dia; o admin vê o total e o pagamento.</p>
      </div>
      <MotoboyClient motoboys={motoboys} rotas={rotas} lojas={(lojas ?? []) as Loja[]} userId={userId} isMaster={isMaster} erro={erro} />
    </div>
  )
}
