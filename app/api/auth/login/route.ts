import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?erro=${encodeURIComponent('E-mail ou senha incorretos.')}`, request.url)
    )
  }

  // 303 = See Other: garante que o browser faz GET em /painel após o POST (PRG pattern)
  return NextResponse.redirect(new URL('/painel', request.url), 303)
}
