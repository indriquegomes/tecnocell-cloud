import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const authClient = await createClient()
  const { data: { session } } = await authClient.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const valor = await request.json()
  const supabase = await createServiceClient()
  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave: 'empresa', valor }, { onConflict: 'chave' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
