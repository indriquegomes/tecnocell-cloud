'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function SessionGuard() {
  useEffect(() => {
    const supabase = createClient()

    // Renova o token a cada 50 minutos (expira em 60 min)
    const interval = setInterval(async () => {
      const { error } = await supabase.auth.refreshSession()
      if (error) {
        // Sessão não pode ser renovada — redireciona para login
        window.location.href = '/login'
      }
    }, 50 * 60 * 1000)

    // Sair ao fechar a aba se configurado
    const noPersist = localStorage.getItem('tc_no_persist')
    const handleUnload = noPersist === '1' ? () => {
      supabase.auth.signOut()
      localStorage.removeItem('tc_no_persist')
    } : null

    if (handleUnload) window.addEventListener('pagehide', handleUnload)

    return () => {
      clearInterval(interval)
      if (handleUnload) window.removeEventListener('pagehide', handleUnload)
    }
  }, [])

  return null
}
