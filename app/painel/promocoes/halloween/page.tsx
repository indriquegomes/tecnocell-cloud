import { requireAuth } from '@/lib/supabase/server'
import HalloweenProfit from './HalloweenProfit'
export default async function Page(){await requireAuth();return <HalloweenProfit/>}
