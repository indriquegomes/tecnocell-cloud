'use client'

// BOTÃO SAIR — desloga no SERVIDOR e no NAVEGADOR.
//
// O que estava acontecendo (achado em 03/11/2026): o "Sair" só mandava POST para
// /api/auth/signout, que apaga o cookie da sessão. Mas o PDV lê o token do
// cliente do Supabase no NAVEGADOR (localStorage). Esse continua vivo depois do
// logout do servidor — então a próxima pessoa que entra no mesmo computador
// aparece com a sessão anterior, e a venda sai no nome de quem já tinha saído.
// Em outubro/2026 isso colocou 91 mil de venda no cadastro de duas pessoas que
// nem estavam na loja.
//
// Correção: limpar a sessão do navegador ANTES de mandar pro servidor. Se o
// signOut do navegador falhar (rede, storage bloqueado), o logout do servidor
// acontece do mesmo jeito — nunca deixa a pessoa presa na tela.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function BotaoSair({
  className = '',
  children = 'Sair',
}: {
  className?: string
  children?: React.ReactNode
}) {
  const [saindo, setSaindo] = useState(false)

  return (
    <form
      action="/api/auth/signout"
      method="POST"
      onSubmit={async (e) => {
        if (saindo) { e.preventDefault(); return }
        e.preventDefault()
        setSaindo(true)
        try {
          await createClient().auth.signOut()
        } catch {
          // sem sessão no navegador ou storage bloqueado: segue para o servidor
        }
        // submit nativo: não passa de novo pelo onSubmit (nada de loop)
        const form = e.currentTarget as HTMLFormElement
        form.submit()
      }}
    >
      <button
        type="submit"
        disabled={saindo}
        className={`${className} disabled:opacity-60`}
      >
        {saindo ? 'Saindo…' : children}
      </button>
    </form>
  )
}
