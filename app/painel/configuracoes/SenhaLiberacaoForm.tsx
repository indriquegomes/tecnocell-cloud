'use client'

import { Spinner } from '@/components/Spinner'
import { useActionState } from 'react'
import { alterarSenhaLiberacao } from './actions'

// Formulário próprio (fora do ConfigForm) pra não misturar a senha com o resto
// das configurações — e porque usa OUTRA server action, com estado separado.
export function SenhaLiberacaoForm() {
  const [state, formAction, pending] = useActionState(alterarSenhaLiberacao, { ok: false, erro: null })

  return (
    <form action={formAction} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-3">
        🔑 Senha de liberação da devolução
      </h3>
      <p className="text-xs text-gray-400">
        Senha que o dono digita quando uma devolução fura uma regra de dinheiro e ele autoriza mesmo assim.
        Fica guardada embaralhada (nunca em texto) e vale para as duas lojas.
      </p>

      {state.ok && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Senha trocada com sucesso.
        </div>
      )}
      {state.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.erro}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Senha atual</label>
          <input name="senha_atual" type="password" autoComplete="current-password" className="field" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Nova senha</label>
          <input name="senha_nova" type="password" autoComplete="new-password" className="field" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirmar nova senha</label>
          <input name="senha_confirma" type="password" autoComplete="new-password" className="field" />
        </div>
      </div>

      <div className="pt-1">
        <button type="submit" disabled={pending}
          className="rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 transition disabled:opacity-60">
          {pending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Trocando...</span> : 'Trocar senha'}
        </button>
      </div>
    </form>
  )
}
