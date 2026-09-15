import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// Lojas que o usuário logado PODE ver. Master (ou sem restrição) = todas, MAS a
// tela NUNCA mistura: uma única loja ATIVA (cookie `tc_loja_ativa`) rege o filtro.
// Atendente restrita = só as de `lojas_permitidas` do perfil. Usado pra filtrar
// vendas/pedidos/fiados por loja e mostrar a loja ativa no seletor do topo.
// Nunca lança: se falhar (ou não achar loja), cai em "vê todas" (fail-open, como antes).
export async function lojasDoUsuario(): Promise<{
  todasLojas: { id: string; nome: string }[]
  operaveis: { id: string; nome: string }[]   // lojas que o usuário pode OPERAR (master=todas)
  permitidas: { id: string; nome: string }[]  // 1 única loja ATIVA — o que a tela filtra
  ativa: { id: string; nome: string } | null
  todas: boolean                               // true = sem loja ativa → mostra tudo (fail-open)
}> {
  const supabase = await createServiceClient()
  const { data } = await supabase.from('lojas').select('id, nome').order('nome')
  const todasLojas = (data ?? []) as { id: string; nome: string }[]
  const user = await requireAuth().catch(() => null)
  if (!user) return { todasLojas, operaveis: todasLojas, permitidas: todasLojas, ativa: null, todas: true }

  const { data: perfil } = await supabase
    .from('perfis').select('is_master, lojas_permitidas').eq('id', user.id).maybeSingle()
  const ids = (perfil?.lojas_permitidas ?? []) as string[]
  const isMaster = !!perfil?.is_master
  const operaveis = isMaster || ids.length === 0
    ? todasLojas
    : todasLojas.filter((l) => ids.includes(l.id))

  const ck = (await cookies()).get('tc_loja_ativa')?.value
  const ativa = operaveis.find((l) => l.id === ck) ?? operaveis[0] ?? null
  if (!ativa) return { todasLojas, operaveis, permitidas: operaveis, ativa: null, todas: true }
  return { todasLojas, operaveis, permitidas: [ativa], ativa, todas: false }
}
