import { carregarClientesPDV } from '@/app/painel/pdv/actions'
import type { NextRequest } from 'next/server'

// GET em vez de server action — ver o porquê em app/api/pdv/catalogo/route.ts
// (server actions são serializadas pelo Next e travavam o F9 no mount do PDV).
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  try {
    const clientes = await carregarClientesPDV(token)
    return Response.json(clientes, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Erro ao carregar clientes.', { status: 403 })
  }
}
