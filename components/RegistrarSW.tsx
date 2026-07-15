'use client'

import { useEffect } from 'react'

// Registra o Service Worker (public/sw.js) — o que faz o app abrir voando no tablet.
// Silencioso: se o navegador não suportar ou falhar, o app funciona igual, só sem
// o cache de assets. Roda uma vez, no carregamento.
export function RegistrarSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* sem SW, app segue normal */ })
    }
  }, [])
  return null
}
