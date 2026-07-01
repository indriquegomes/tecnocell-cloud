import { NextResponse, type NextRequest } from 'next/server'

// Next.js 16: "middleware" agora se chama "proxy".
//
// CRÍTICO: NÃO usar supabase-js aqui. Em produção, quando o servidor responde
// AuthSessionMissing (sessão rotacionada), o supabase-js chama _removeSession()
// e APAGA o cookie — derrubando o login depois de 1-2 navegações. Isso quebrou
// todas as vendas em 2026-06-24.
//
// Por isso validamos o token com um fetch DIRETO ao endpoint /auth/v1/user do
// Supabase (Bearer). Esse fetch só LÊ — não gerencia sessão, não toca cookie.
// Valida a ASSINATURA do JWT no servidor do Supabase; não confiamos no conteúdo
// local do cookie. A identidade verificada é repassada via header x-user-id.

interface Claims { sub: string; email?: string }

function extrairToken(request: NextRequest): string | null {
  const partes = request.cookies
    .getAll()
    .filter((c) => /-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (partes.length === 0) return null

  try {
    let raw = partes.map((c) => c.value).join('')
    if (raw.startsWith('base64-')) raw = atob(raw.slice(7))
    const sessao = JSON.parse(raw)
    return typeof sessao.access_token === 'string' ? sessao.access_token : null
  } catch {
    return null
  }
}

async function validarToken(token: string): Promise<Claims | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
    })
    if (!res.ok) return null
    const user = await res.json()
    if (!user?.id) return null
    return { sub: user.id, email: user.email }
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  const token = extrairToken(request)
  const sessao = token ? await validarToken(token) : null
  const noPainel = request.nextUrl.pathname.startsWith('/painel')

  if (!sessao && noPainel) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Clona headers e REMOVE qualquer x-user-* forjado que tenha vindo do cliente.
  // Sem isso, um atacante mandaria x-user-id direto e seria tratado como logado.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-user-id')
  requestHeaders.delete('x-user-email')
  requestHeaders.set('x-pathname', request.nextUrl.pathname)
  if (sessao) {
    requestHeaders.set('x-user-id', sessao.sub)
    if (sessao.email) requestHeaders.set('x-user-email', sessao.email)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('x-pathname', request.nextUrl.pathname)
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
