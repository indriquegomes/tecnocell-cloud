import { requireAuth, createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect, unstable_rethrow } from 'next/navigation'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const cookieStore = await cookies()
  const raw = cookieStore.get('ml_oauth_pkce')?.value
  cookieStore.delete('ml_oauth_pkce')

  if (!code || !state || !raw) redirect('/painel/integracoes?ml=erro')

  // Parse do cookie + chamadas à API do ML podem falhar de várias formas
  // (cookie corrompido, DNS, timeout, resposta não-JSON) — tudo isso cai no
  // catch e redireciona pra ?ml=erro. O redirect() de SUCESSO fica FORA
  // deste bloco: ele lança por baixo dos panos (NEXT_REDIRECT) e não pode
  // ser pego por este catch.
  let token: { access_token: string; refresh_token: string; expires_in: number; user_id: number }
  let me: { nickname?: string }
  try {
    const { verifier, state: stateEsperado } = JSON.parse(raw) as { verifier: string; state: string }
    if (state !== stateEsperado) redirect('/painel/integracoes?ml=erro')

    const redirectUri = new URL('/api/integracoes/mercado-livre/callback', req.url).toString()
    const tokenResp = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.MERCADOLIVRE_CLIENT_ID!,
        client_secret: process.env.MERCADOLIVRE_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    })
    if (!tokenResp.ok) redirect('/painel/integracoes?ml=erro')
    token = await tokenResp.json() as {
      access_token: string; refresh_token: string; expires_in: number; user_id: number
    }

    const meResp = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    me = meResp.ok ? await meResp.json() as { nickname?: string } : {}
  } catch (err) {
    unstable_rethrow(err) // deixa o redirect() de state/tokenResp passar direto
    redirect('/painel/integracoes?ml=erro')
  }

  let usuarioId: string | null = null
  try { usuarioId = (await requireAuth()).id } catch { /* sessão pode ter expirado no meio do fluxo — segue sem autor registrado */ }

  const supabase = await createServiceClient()
  const { error } = await supabase.from('integracoes_mercado_livre').upsert({
    ml_user_id: String(token.user_id),
    ml_nickname: me.nickname ?? null,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expira_em: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    conectado_por: usuarioId,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'ml_user_id' })
  if (error) redirect('/painel/integracoes?ml=erro')

  redirect('/painel/integracoes?ml=conectado')
}
