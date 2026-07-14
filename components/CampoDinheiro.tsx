'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'

// CAMPO DE DINHEIRO — formata sozinho, como calculadora de PDV.
//
// Vitor: "em áreas que têm parte financeira, dinheiro e coisa assim, já tenta incluir
// dinheiro de forma automática. Quero um sistema fácil de fluir, entendível e já meio
// automático."
//
// Antes eram <input type="number"> crus: o campo mostrava "10" e você não sabia se era
// R$10,00 ou R$0,10. Sem R$, sem separador de milhar, e ainda dava pra digitar letra
// ou colar lixo.
//
// Como funciona (é o padrão que toda maquininha usa — entra pelos CENTAVOS):
//   digita 1        → R$ 0,01
//   digita 10       → R$ 0,10
//   digita 1000     → R$ 10,00
//   digita 150000   → R$ 1.500,00
//
// Ninguém precisa pensar em vírgula, ponto ou zero à esquerda: só digita o número e o
// campo se vira. Backspace apaga de trás pra frente, como esperado.
//
// O valor real vai num <input type="hidden"> com ponto decimal ("1500.00"), que é o que
// o servidor espera — o campo visível é só a máscara.

const paraBRL = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function CampoDinheiro({
  name,
  defaultValue = 0,
  value,
  onChange,
  onFocus,
  onKeyDown,
  placeholder = '0,00',
  required,
  disabled,
  autoFocus,
  className = '',
  id,
}: {
  name?: string
  /** valor inicial em REAIS (ex: 1500.5) */
  defaultValue?: number
  /** controlado: valor em REAIS */
  value?: number
  onChange?: (reais: number) => void
  /** substitui o "selecionar tudo" padrão — o PDV usa pra auto-preencher o troco restante */
  onFocus?: () => void
  /** Enter salva / Esc cancela, na edição inline da tabela de preço */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  id?: string
}) {
  const controlado = value !== undefined
  const [centavos, setCentavos] = useState(() => Math.round((controlado ? value! : defaultValue) * 100))

  useEffect(() => {
    if (controlado) setCentavos(Math.round(value! * 100))
  }, [value, controlado])

  const setar = (c: number) => {
    const limpo = Math.max(0, Math.min(c, 99_999_999_99))   // teto: R$ 99.999.999,99
    if (!controlado) setCentavos(limpo)
    onChange?.(limpo / 100)
  }

  // Reconstrói pelos dígitos: qualquer coisa que não é número é ignorada. Isso mata
  // colar "R$ 1.234,56" quebrado, letra, vírgula solta — tudo vira o número certo.
  const digitar = (texto: string) => {
    const digitos = texto.replace(/\D/g, '')
    setar(digitos === '' ? 0 : parseInt(digitos, 10))
  }

  // O CURSOR NÃO PODE PARAR NO MEIO DO NÚMERO. O texto é alinhado à direita, então um
  // clique no meio do campo deixava o cursor entre os dígitos e a digitação entrava no
  // lugar errado: num campo em "0,00", teclar 2-5-0-5-0 saía R$ 250.000,50 em vez de
  // R$ 250,50. Num fechamento de caixa isso é dinheiro errado na gaveta.
  //
  // Solução: clicar NUNCA posiciona cursor — sempre seleciona o valor inteiro. Digitar
  // substitui, e o cursor volta pro fim a cada tecla. Não dá pra editar "no meio" do
  // número, o que é exatamente o certo pra um campo com máscara.
  // Roda só quando o valor muda (digitar), nunca no foco — então a seleção do onFocus
  // sobrevive e a primeira tecla substitui o campo inteiro.
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && el === document.activeElement) el.setSelectionRange(el.value.length, el.value.length)
  }, [centavos])

  const selecionarTudo = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault()             // impede o navegador de largar o cursor onde clicou
    const el = ref.current
    if (!el || disabled) return
    el.focus()                     // dispara o onFocus (select() ou o auto-preencher do PDV)
    if (onFocus) el.setSelectionRange(el.value.length, el.value.length)
    else el.select()
  }

  return (
    <div className="relative">
      <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium ${disabled ? 'text-gray-300' : 'text-gray-400'}`}>
        R$
      </span>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        value={paraBRL(centavos)}
        onChange={(e) => digitar(e.target.value)}
        onFocus={(e) => (onFocus ? onFocus() : e.target.select())}
        onMouseDown={selecionarTudo}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={`field pl-9 text-right font-semibold tabular-nums ${className}`}
      />
      {/* o que o servidor recebe: número com ponto decimal */}
      {name && <input type="hidden" name={name} value={(centavos / 100).toFixed(2)} required={required} />}
    </div>
  )
}
