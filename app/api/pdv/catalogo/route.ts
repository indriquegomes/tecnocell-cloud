import { carregarCatalogoPDV } from '@/app/painel/pdv/actions'
import type { NextRequest } from 'next/server'

// Pré-carregamento do PDV via GET, NÃO via server action.
//
// O Next SERIALIZA server actions: uma espera a outra. O catálogo (8 mil produtos)
// levava ~4s e, enquanto rodava no mount, tudo que a menina fazia (F9 crediário,
// busca) ficava preso na fila — abrir o crediário custava 7,6s em vez de 2,5s.
// GET não entra nessa fila: carrega em paralelo e nunca trava a operação.
// A regra de permissão é a mesma — a action já chama requirePermissao('pdv').
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  try {
    const produtos = await carregarCatalogoPDV(token)
    return Response.json(produtos, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Erro ao carregar catálogo.', { status: 403 })
  }
}
