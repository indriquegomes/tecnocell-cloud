import { NextRequest, NextResponse } from 'next/server'

// Troca a loja ATIVA da sessão gravando o cookie `tc_loja_ativa`.
// Rota (e não server action) de propósito: server action não consegue gravar
// cookie de forma confiável na Vercel — aqui a resposta JSON carrega o Set-Cookie.
export async function POST(request: NextRequest) {
  let lojaId = ''
  try {
    const body = await request.json()
    lojaId = typeof body?.loja_id === 'string' ? body.loja_id : ''
  } catch {}

  const res = NextResponse.json({ ok: true })
  if (lojaId) {
    res.cookies.set('tc_loja_ativa', lojaId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  }
  return res
}
