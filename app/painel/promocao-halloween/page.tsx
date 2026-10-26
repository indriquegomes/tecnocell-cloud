import { requireAuth } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import HalloweenClient from './HalloweenClient'
export default async function PromocaoHalloweenPage() {
  await requireAuth()
  const { ativa } = await lojasDoUsuario()
  if (!ativa) return <p className="p-6">Selecione uma loja no topo para consultar a promoção Halloween.</p>
  return <HalloweenClient key={ativa.id} activeStoreId={ativa.id} activeStoreName={ativa.nome} />
}
