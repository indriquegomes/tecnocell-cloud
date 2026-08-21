import { requirePermissao } from '@/lib/supabase/server'
import { urlAutorizacao } from '@/lib/mercado-livre'
import { randomBytes, createHash } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function GET(req: Request) {
  try {
    await requirePermissao('integracoes')
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  // O maxLength do formulário é só do lado do navegador — sem limitar aqui
  // também, um nome gigante estoura o limite de ~4KB do cookie (o valor
  // acentuado ainda fica maior depois do encodeURIComponent), o cookie some
  // sem aviso, e o callback falha com "?ml=erro" sem pista nenhuma do motivo.
  const nome = new URL(req.url).searchParams.get('nome')?.trim().slice(0, 60) || null

  const verifier = base64url(randomBytes(48))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  const cookieStore = await cookies()
  cookieStore.set('ml_oauth_pkce', JSON.stringify({ verifier, state, nome }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const redirectUri = new URL('/api/integracoes/mercado-livre/callback', req.url).toString()
  redirect(urlAutorizacao(state, challenge, redirectUri))
}
