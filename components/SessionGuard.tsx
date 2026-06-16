'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function SessionGuard() {
  useEffect(() => {
    const supabase = createClient()

    // Refresh the session every 50 min — access tokens expire in 60 min
    const interval = setInterval(async () => {
      const { error } = await supabase.auth.refreshSession()
      if (error) window.location.href = '/login'
    }, 50 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  return null
}
