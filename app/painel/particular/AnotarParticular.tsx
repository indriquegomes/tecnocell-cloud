'use client'

// "Anotar dinheiro" da aba Particular — estrutura do protótipo, cores do app:
// azul #1B6CA8 (ação), cinza neutro, emerald/rose para entrada/saída.

import { useState } from 'react'
import { anotarParticular } from './actions'

const CATEGORIAS: Record<'entrada' | 'saida', string[]> = {
  entrada: ['Pró-labore', 'Outros'],
  saida: ['Casa', 'Mercado', 'Escola', 'Saúde', 'Carro', 'Outros'],
}

const COR: Record<string, string> = {
  'Pró-labore': '#059669', Outros: '#94a3b8',
  Casa: '#e11d48', Mercado: '#059669', Escola: '#0284c7',
  Saúde: '#f59e0b', Carro: '#1B6CA8',
}

const CARD = 'rounded-2xl border border-gray-200 bg-white shadow-sm'
const BTN_BASE = 'inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B6CA8]'

export function AnotarParticular() {
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('saida')
  const [categoria, setCategoria] = useState('Casa')

  const trocarTipo = (t: 'entrada' | 'saida') => {
    setTipo(t)
    setCategoria(t === 'entrada' ? 'Pró-labore' : 'Casa')
  }

  return (
    <form action={anotarParticular} className={`${CARD} flex w-full max-w-[640px] flex-col gap-4 p-6`}>
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="categoria" value={categoria} />

      <div className="grid grid-cols-2 gap-3">
        <button type="button" aria-pressed={tipo === 'entrada'} onClick={() => trocarTipo('entrada')}
          className={`${BTN_BASE} border ${tipo === 'entrada' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
          Entrou dinheiro
        </button>
        <button type="button" aria-pressed={tipo === 'saida'} onClick={() => trocarTipo('saida')}
          className={`${BTN_BASE} border ${tipo === 'saida' ? 'border-rose-500 bg-rose-500 text-white' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
          Saiu dinheiro
        </button>
      </div>

      <div>
        <label htmlFor="valor" className="text-sm font-medium text-gray-500">Valor</label>
        <input id="valor" name="valor" inputMode="decimal" autoComplete="off" placeholder="R$ 0,00"
          className="mt-1 h-20 w-full rounded-xl border border-gray-300 bg-white text-center text-3xl font-semibold tabular-nums text-gray-800 placeholder:text-gray-300 focus:border-[#1B6CA8] focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]/30" />
      </div>

      <div>
        <div className="mb-2 text-sm font-medium text-gray-500">Para quê?</div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS[tipo].map((c) => (
            <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}
              className={`flex min-h-[40px] items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition ${categoria === c ? 'border-[#F47920] bg-orange-50 text-[#9a3412]' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: COR[c] ?? '#94a3b8' }} />
              {c}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" className={`${BTN_BASE} min-h-[52px] w-full bg-[#1B6CA8] text-base text-white hover:bg-[#155a8e]`}>Salvar</button>
    </form>
  )
}
