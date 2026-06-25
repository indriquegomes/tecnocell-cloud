import { headers } from 'next/headers'
import { PainelShell } from '@/components/PainelShell'
import { createServiceClient } from '@/lib/supabase/server'

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const email = headersList.get('x-user-email') ?? ''
  const userId = headersList.get('x-user-id') ?? ''

  let nome = email.split('@')[0] // fallback: parte antes do @
  let cargo = 'vendedor'

  if (userId) {
    try {
      const supabase = await createServiceClient()
      const { data } = await supabase
        .from('perfis')
        .select('nome, cargo')
        .eq('id', userId)
        .maybeSingle()
      if (data) {
        nome = data.nome
        cargo = data.cargo
      }
    } catch {}
  }

  return <PainelShell email={email} nome={nome} cargo={cargo}>{children}</PainelShell>
}
