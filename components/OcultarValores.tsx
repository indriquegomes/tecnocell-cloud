'use client'

import { useEffect, useState } from 'react'

// Botão "olho" que esconde os valores em dinheiro na tela (tipo app de banco).
// Útil quando a atendente mostra a tela pra um cliente ou pro gerente do lado.
//
// Base reutilizável: liga/desliga a classe `tc-ocultar-valores` no <html>. Qualquer
// número marcado com <Valor> (classe .tc-sensivel) fica borrado quando ligado.
// A escolha fica salva em localStorage e vale pro sistema todo.
const CHAVE = 'tc:ocultar-valores'

// Roda ANTES da tela pintar (injetado no shell) pra não "piscar" o valor ao carregar.
export const scriptOcultarValores = `try{if(localStorage.getItem('${CHAVE}')==='1'){document.documentElement.classList.add('tc-ocultar-valores')}}catch(e){}`

export function OcultarValores() {
  const [oculto, setOculto] = useState(false)

  // sincroniza o estado do botão com o que o script já aplicou
  useEffect(() => {
    setOculto(document.documentElement.classList.contains('tc-ocultar-valores'))
  }, [])

  const alternar = () => {
    const novo = !oculto
    setOculto(novo)
    document.documentElement.classList.toggle('tc-ocultar-valores', novo)
    try { localStorage.setItem(CHAVE, novo ? '1' : '0') } catch { /* sem storage, tudo bem */ }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={oculto}
      title={oculto ? 'Mostrar valores' : 'Esconder valores'}
      aria-label={oculto ? 'Mostrar valores' : 'Esconder valores'}
      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
    >
      {oculto ? (
        // olho cortado
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
        </svg>
      ) : (
        // olho aberto
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  )
}
