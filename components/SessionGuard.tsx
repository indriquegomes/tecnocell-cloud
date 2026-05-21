'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function SessionGuard() {
  useEffect(() => {
    const noPersist = localStorage.getItem('tc_no_persist')
    if (noPersist !== '1') return

    const handleUnload = () => {
      const supabase = createClient()
      supabase.auth.signOut()
      localStorage.removeItem('tc_no_persist')
    }

    window.addEventListener('pagehide', handleUnload)
    return () => window.removeEventListener('pagehide', handleUnload)
  }, [])

  return null
}
