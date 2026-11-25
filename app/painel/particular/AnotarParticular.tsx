'use client'

// "Anotar dinheiro" — tela do painel divertido da aba Particular.
// Mesma estrutura da Nova movimentação do protótipo, com o tema divertido
// (Nunito, tinta roxa #2B2350, borda 3px, botão amarelo #FFC93C).

import { useState } from 'react'
import { anotarParticular } from './actions'

const CATEGORIAS: Record<'entrada' | 'saida', string[]> = {
  entrada: ['Pró-labore', 'Outros'],
  saida: ['Casa', 'Mercado', 'Escola', 'Saúde', 'Carro', 'Outros'],
}

const COR: Record<string, string> = {
  'Pró-labore': '#2EC4A0', Outros: '#C9C2E3',
  Casa: '#FF6B6B', Mercado: '#2EC4A0', Escola: '#4CC9F0',
  Saúde: '#FFC93C', Carro: '#7B6CF6',
}

const BTN = 'inline-flex min-h-[46px] items-center justify-center rounded-[16px] border-[3px] border-[#2B2350] px-[18px] text-[16px] font-extrabold text-[#2B2350] shadow-[0_3px_0_#2B2350] transition-[transform,box-shadow] duration-100 hover:-translate-y-px active:translate-y-[2px] active:shadow-[0_1px_0_#2B2350] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]'
const CARD = 'rounded-[16px] border-[3px] border-[#2B2350] bg-white shadow-[0_3px_0_#2B2350]'

export function AnotarParticular() {
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('saida')
  const [categoria, setCategoria] = useState('Casa')

  const trocarTipo = (t: 'entrada' | 'saida') => {
    setTipo(t)
    setCategoria(t === 'entrada' ? 'Pró-labore' : 'Casa')
  }

  return (
    <form action={anotarParticular} className={`${CARD} flex w-full max-w-[640px] flex-col gap-[18px] p-6`}>
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="categoria" value={categoria} />

      <div className="grid grid-cols-2 gap-3">
        <button type="button" aria-pressed={tipo === 'entrada'} onClick={() => trocarTipo('entrada')}
          className={`${BTN} ${tipo === 'entrada' ? 'bg-[#2EC4A0]' : 'bg-white'}`}>Entrou dinheiro</button>
        <button type="button" aria-pressed={tipo === 'saida'} onClick={() => trocarTipo('saida')}
          className={`${BTN} ${tipo === 'saida' ? 'bg-[#FF6B6B]' : 'bg-white'}`}>Saiu dinheiro</button>
      </div>

      <div>
        <label htmlFor="valor" className="text-[15px] font-bold text-[#2B2350]">Valor</label>
        <input id="valor" name="valor" inputMode="decimal" autoComplete="off" placeholder="R$ 0,00"
          className="mt-1 h-[76px] w-full rounded-[16px] border-[3px] border-[#2B2350] bg-white text-center text-[40px] font-extrabold tabular-nums text-[#2B2350] placeholder:text-[#2B2350]/25 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]" />
      </div>

      <div>
        <div className="mb-2 text-[15px] font-bold text-[#2B2350]">Para quê?</div>
        <div className="flex flex-wrap gap-2.5">
          {CATEGORIAS[tipo].map((c) => (
            <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}
              className={`flex min-h-[46px] items-center gap-2 rounded-full border-[3px] border-[#2B2350] px-4 text-[15px] font-extrabold text-[#2B2350] shadow-[0_2px_0_#2B2350] transition-[transform,box-shadow] duration-100 active:translate-y-[1px] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6] ${categoria === c ? 'bg-[#FFC93C]' : 'bg-white'}`}>
              <span aria-hidden className="h-3.5 w-3.5 rounded-full border-[3px] border-[#2B2350]" style={{ background: COR[c] ?? '#4CC9F0' }} />
              {c}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" className={`${BTN} min-h-[60px] w-full bg-[#FFC93C] text-[20px]`}>Salvar</button>
    </form>
  )
}
