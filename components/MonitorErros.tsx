'use client'

import { useEffect } from 'react'
import { enviarErro } from '@/lib/erros-cliente'

// Escuta o que estoura fora do React: promessa que ninguém tratou e erro de
// script. Não renderiza nada e não envolve nada — o erro continua aparecendo na
// tela do mesmo jeito; aqui só fica o registro para o dono saber depois.
//
// Erro dentro de componente NÃO passa por aqui (o React o entrega ao
// error.tsx da rota) — os dois caminhos juntos é que cobrem a tela toda.
export function MonitorErros() {
  useEffect(() => {
    function aoErro(ev: ErrorEvent) {
      const tipo = ev.error instanceof Error ? ev.error.name : 'Erro'
      enviarErro({
        // Título sem o texto da mensagem: mensagem muda a cada ocorrência e
        // partiria o mesmo problema em dezenas de grupos no aviso.
        titulo: 'Erro na tela (' + tipo + ')',
        mensagem: ev.message,
        tela: location.pathname,
      })
    }

    function aoRejeitar(ev: PromiseRejectionEvent) {
      const motivo = ev.reason instanceof Error ? ev.reason.message : String(ev.reason ?? '')
      enviarErro({
        titulo: 'Ação travou (promessa sem tratamento)',
        mensagem: motivo,
        tela: location.pathname,
      })
    }

    window.addEventListener('error', aoErro)
    window.addEventListener('unhandledrejection', aoRejeitar)
    return () => {
      window.removeEventListener('error', aoErro)
      window.removeEventListener('unhandledrejection', aoRejeitar)
    }
  }, [])

  return null
}
