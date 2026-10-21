import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = req.headers.get('authorization') ?? ''
  const esperado = segredo ? `Bearer ${segredo}` : ''
  if (!esperado || Buffer.byteLength(recebido) !== Buffer.byteLength(esperado)
    || !timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) {
    return Response.json({ erro: 'Não autorizado.' }, { status: 401 })
  }
  if (process.env.PEDIDOS_APP_AUTO_CREDITO_ENABLED !== 'true') {
    return Response.json({ habilitado: false }, { headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    const service = await createServiceClient()
    const { data, error } = await service.rpc('processar_pedidos_app_credito', { p_limite: 5 })
    if (error) return Response.json({ erro: 'Processamento indisponível.' }, { status: 503 })
    return Response.json({ processados: data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ erro: 'Processamento indisponível.' }, { status: 503 })
  }
}
