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
  function voltarAoLogin(mensagem: string) {
    const login = new URL('/login', request.url)
    login.searchParams.set('erro', mensagem)
    login.searchParams.set('next', destino)
    return NextResponse.redirect(login, 303)
  }

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
      return voltarAoLogin(ERRO)
    }
    const { data: { user } } = await service.auth.admin.getUserById(perfil.id)
    if (!user?.email) {
      return voltarAoLogin(ERRO)
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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return voltarAoLogin(ERRO)
  }

  // Motoboy (cargo MOTOBOY) cai direto na tela de registro de rotas.
  // Segurança: acesso bloqueado (deslogou) só o master libera.
  if (data?.user?.id) {
    const service = createServerClient(url, serviceKey, {
      cookies: { getAll() { return [] }, setAll() {} },
    })
    const { data: perf } = await service.from('perfis').select('cargo_id, is_master, login_bloqueado, data_demissao').eq('id', data.user.id).maybeSingle()
    const p = perf as { cargo_id?: string | null; is_master?: boolean | null; login_bloqueado?: boolean | null; data_demissao?: string | null } | null
    if (p?.login_bloqueado && !p.is_master) {
      return voltarAoLogin('Acesso bloqueado. Peça ao master para liberar.')
    }
    if (p?.data_demissao && !p.is_master) {
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      if (p.data_demissao <= hoje) {
        return voltarAoLogin('Acesso encerrado.')
      }
    }
    const cargoId = p?.cargo_id ?? null
    if (cargoId) {
      const { data: cargo } = await service.from('cargos').select('nome').eq('id', cargoId).maybeSingle()
      if ((cargo as { nome?: string } | null)?.nome === 'MOTOBOY') {
        response.headers.set('Location', new URL('/painel/motoboy', request.url).toString())
      }
    }
  }

  return response
}
