'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SessionGuard() {
  const router = useRouter()

  useEffect(() => {
    const noPersist = localStorage.getItem('tc_no_persist')
    const alive = sessionStorage.getItem('tc_alive')

    if (noPersist === '1' && !alive) {
      const supabase = createClient()
      supabase.auth.signOut().then(() => {
        localStorage.removeItem('tc_no_persist')
        router.push('/login')
      })
    }
  }, [router])

  return null
}
