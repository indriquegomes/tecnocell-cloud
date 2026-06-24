import { NextResponse, type NextRequest } from 'next/server'

// Next.js 16: "middleware" agora se chama "proxy". Doc: aqui só "optimistic checks".
//
// CRÍTICO: NÃO chamar supabase.auth.getUser() aqui. Em produção, quando o servidor
// responde AuthSessionMissing (sessão rotacionada), o supabase-js chama _removeSession()
// e APAGA o cookie — derrubando o login depois de 1-2 navegações. Isso quebrou todas
// as vendas em 2026-06-24. A autorização real fica no requireAuth(accessToken) das
// server actions, que valida o token sem depender de cookie.
//
// Aqui só decodificamos o JWT do cookie LOCALMENTE (sem rede, sem limpar nada) para o
// check otimista de redirect e para repassar x-user-id aos server components.

interface Claims { sub: string; email?: string }

function b64urlToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  return atob(b64)
}

function lerSessao(request: NextRequest): Claims | null {
  // Junta os chunks do cookie de sessão (sb-<ref>-auth-token[.N])
  const partes = request.cookies
    .getAll()
    .filter((c) => /-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (partes.length === 0) return null

  try {
    let raw = partes.map((c) => c.value).join('')
    if (raw.startsWith('base64-')) raw = atob(raw.slice(7))
    const sessao = JSON.parse(raw)
    const token: string | undefined = sessao.access_token
    if (!token) return null
    const payload = JSON.parse(b64urlToString(token.split('.')[1]))
    if (!payload.sub) return null
    return { sub: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

export function proxy(request: NextRequest) {
  const sessao = lerSessao(request)
  const noPainel = request.nextUrl.pathname.startsWith('/painel')

  if (!sessao && noPainel) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Repassa identidade aos server components/actions via REQUEST header.
  const requestHeaders = new Headers(request.headers)
  if (sessao) {
    requestHeaders.set('x-user-id', sessao.sub)
    if (sessao.email) requestHeaders.set('x-user-email', sessao.email)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  if (sessao) {
    response.headers.set('x-user-id', sessao.sub)
    if (sessao.email) response.headers.set('x-user-email', sessao.email)
  }
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
