import { createServiceClient, requireAuth } from '@/lib/supabase/server'

// Lojas que o usuário logado PODE ver. Master (ou sem restrição) = todas.
// Atendente restrita = só as de `lojas_permitidas` do perfil. Usado pra filtrar
// vendas/pedidos por loja e mostrar automático a loja da atendente (adendo Isa 29/07).
// Nunca lança (a página não pode quebrar): se falhar, cai em "vê todas".
export async function lojasDoUsuario(): Promise<{
  todasLojas: { id: string; nome: string }[]
  permitidas: { id: string; nome: string }[]
  todas: boolean
}> {
  const supabase = await createServiceClient()
  const { data } = await supabase.from('lojas').select('id, nome').order('nome')
  const todasLojas = (data ?? []) as { id: string; nome: string }[]
  const user = await requireAuth().catch(() => null)
  if (!user) return { todasLojas, permitidas: todasLojas, todas: true }
  const { data: perfil } = await supabase.from('perfis').select('is_master, lojas_permitidas').eq('id', user.id).maybeSingle()
  const ids = (perfil?.lojas_permitidas ?? []) as string[]
  if (perfil?.is_master || ids.length === 0) return { todasLojas, permitidas: todasLojas, todas: true }
  return { todasLojas, permitidas: todasLojas.filter(l => ids.includes(l.id)), todas: false }
}
