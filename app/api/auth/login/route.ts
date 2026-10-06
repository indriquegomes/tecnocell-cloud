import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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

  // Login é só pelo e-mail (removida a variação de login por "usuário"/apelido).
  const email = usuario.toLowerCase()

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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?erro=${encodeURIComponent(ERRO)}`, request.url)
    )
  }

  // Motoboy (cargo MOTOBOY) cai direto na tela de registro de rotas.
  if (data?.user?.id) {
    const service = createServerClient(url, serviceKey, {
      cookies: { getAll() { return [] }, setAll() {} },
    })
    const { data: perf } = await service.from('perfis').select('cargo_id').eq('id', data.user.id).maybeSingle()
    const cargoId = (perf as { cargo_id?: string | null } | null)?.cargo_id ?? null
    if (cargoId) {
      const { data: cargo } = await service.from('cargos').select('nome').eq('id', cargoId).maybeSingle()
      if ((cargo as { nome?: string } | null)?.nome === 'MOTOBOY') {
        response.headers.set('Location', new URL('/painel/motoboy', request.url).toString())
      }
    }
  }

  return response
}
