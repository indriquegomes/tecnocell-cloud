import { createClient, createServiceClient, permissoesEfetivas } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { permissoes, isMaster, ativo } = await permissoesEfetivas(user.id)
  if (!ativo || !temPermissao(permissoes, 'usuarios', isMaster)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const valor = await request.json()
  const supabase = await createServiceClient()
  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave: 'empresa', valor }, { onConflict: 'chave' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
