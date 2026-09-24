import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { normalizarUsuario } from '@/lib/utils'

const ERRO = 'Usuário ou senha incorretos.'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const usuario = ((formData.get('usuario') as string) ?? '').trim()
  const password = formData.get('password') as string
  const next = (formData.get('next') as string | null) ?? ''
  const destino = next.startsWith('/painel') ? next : '/painel'

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Resolve o e-mail por trás do "usuário". Se digitou algo com @, é e-mail
  // (conta antiga); senão é o usuário (primeiro nome) gravado no perfis.
  let email: string
  if (usuario.includes('@')) {
    email = usuario.toLowerCase()
  } else {
    const service = createServerClient(url, serviceKey, {
      cookies: { getAll() { return [] }, setAll() {} },
    })
    const { data: perfil } = await service
      .from('perfis')
      .select('id')
      .eq('username', normalizarUsuario(usuario))
      .maybeSingle()
    if (!perfil) {
      return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(ERRO)}`, request.url))
    }
    const { data: { user } } = await service.auth.admin.getUserById(perfil.id)
    if (!user?.email) {
      return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(ERRO)}`, request.url))
    }
    email = user.email
  }

  // Pré-cria a response 303 para que setAll grave os cookies diretamente nela.
  // Não usamos cookies() de next/headers porque o Next.js não mescla cookies
  // de next/headers em respostas customizadas (NextResponse.redirect) em produção.
  let response = NextResponse.redirect(new URL(destino, request.url), 303)

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(toSet, headers) {
        toSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
        if (headers) {
          Object.entries(headers).forEach(([key, val]) =>
            response.headers.set(key, val)
          )
        }
      },
    },
  })

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?erro=${encodeURIComponent(ERRO)}`, request.url)
    )
  }

  return response
}
