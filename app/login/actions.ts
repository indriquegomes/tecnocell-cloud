'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const MAX_AGES: Record<string, number | undefined> = {
  computador: 30 * 24 * 60 * 60,
  chrome:      7 * 24 * 60 * 60,
  sessao:      undefined,
}

export async function loginAction(formData: FormData) {
  const email       = formData.get('email')      as string
  const password    = formData.get('password')   as string
  const next        = (formData.get('next')       as string | null) ?? ''
  const sessaoTipo  = (formData.get('sessao_tipo') as string | null) ?? 'sessao'

  const cookieStore = await cookies()
  const maxAge = MAX_AGES[sessaoTipo]

  // Gravar preferência antes do sign-in para que createClient.setAll use o maxAge correto
  cookieStore.set('sessao_tipo', sessaoTipo, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    ...(maxAge !== undefined ? { maxAge } : {}),
  })

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const params = new URLSearchParams({ erro: 'E-mail ou senha incorretos.' })
    if (next) params.set('next', next)
    redirect(`/login?${params}`)
  }

  const destino = next?.startsWith('/painel') ? next : '/painel'
  redirect(destino)
}
