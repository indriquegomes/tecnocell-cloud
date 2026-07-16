import { caixaAbertoDaLoja } from '@/app/painel/pdv/actions'
import type { NextRequest } from 'next/server'

// GET em vez de server action — ver o porquê em app/api/pdv/catalogo/route.ts.
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  const loja = req.nextUrl.searchParams.get('loja') ?? ''
  try {
    const aberto = await caixaAbertoDaLoja(token, loja)
    return Response.json({ aberto }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Erro ao consultar o caixa.', { status: 403 })
  }
}
