import { NextResponse } from 'next/server'
import { createServiceClient, requireAuth, permissoesEfetivas } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Conta para o ALERTA NA TELA do master, e só para ele.
//
// O Telegram avisa a cada 10 minutos; este endereço é o que o painel consulta
// para o aviso aparecer no canto da tela enquanto o dono está usando o sistema.
// Não é fila nem caixa de entrada: devolve a contagem recente e as últimas
// ocorrências, nada mais.

const JANELA_MIN = 60
const MAX_ITENS = 3

export async function GET() {
  try {
    const usuario = await requireAuth()
    const { isMaster } = await permissoesEfetivas(usuario.id)
    // Quem não é master não recebe nem o número: o monitoramento é do dono.
    if (!isMaster) return NextResponse.json({ n: 0, itens: [] })

    const supabase = await createServiceClient()
    const { data, count } = await supabase
      .from('erros_app')
      .select('id, created_at, tela, titulo, gravidade', { count: 'exact' })
      .gte('created_at', new Date(Date.now() - JANELA_MIN * 60000).toISOString())
      .order('id')
      .limit(MAX_ITENS)

    return NextResponse.json({ n: count ?? 0, itens: data ?? [] })
  } catch {
    // Sem sessão, sem banco, tabela ainda não criada: tela fica quieta.
    return NextResponse.json({ n: 0, itens: [] })
  }
}
