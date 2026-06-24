'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const next = (formData.get('next') as string | null) ?? ''

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
