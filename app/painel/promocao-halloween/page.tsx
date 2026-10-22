import { requireAuth } from '@/lib/supabase/server'
import HalloweenClient from './HalloweenClient'
export default async function PromocaoHalloweenPage() {
  await requireAuth()
  return <HalloweenClient />
}
