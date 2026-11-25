'use client'

// Tela "Nova movimentação" do painel financeiro (protótipo aprovado).
// O tipo e a categoria são estado de tela (aria-pressed); o submit vai para a
// server action do painel, que grava no Financeiro com as travas de lá.

import { useState } from 'react'
import { salvarMovimentacao } from './actions'

const CATEGORIAS: Record<'entrada' | 'saida', string[]> = {
  entrada: ['Venda', 'Serviço', 'Outros'],
  saida: ['Peças', 'Salários', 'Aluguel', 'Contas', 'Impostos', 'Outros'],
}

const COR_CATEGORIA: Record<string, string> = {
  Venda: '#34C79D', Serviço: '#5BC0EB', Outros: '#7B6CF6',
  Peças: '#34C79D', Salários: '#5BC0EB', Aluguel: '#7B6CF6',
  Contas: '#FFD25A', Impostos: '#FF7A6B',
}

const BTN_BASE =
  'inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] border-2 border-[#1F1B3A] px-4 text-[15px] font-bold text-[#1F1B3A] transition-[transform,box-shadow] duration-100 hover:-translate-y-px active:translate-y-[2px] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]'

export function NovaMovimentacao() {
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  const [categoria, setCategoria] = useState('Venda')

  const trocarTipo = (t: 'entrada' | 'saida') => {
    setTipo(t)
    setCategoria(t === 'entrada' ? 'Venda' : 'Peças')
  }

  return (
    <form action={salvarMovimentacao} className="mx-auto w-full max-w-[640px] rounded-[18px] border-2 border-[#1F1B3A] bg-white p-6 shadow-[0_3px_0_#1F1B3A]">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="categoria" value={categoria} />

      <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-[#5E5780]">Tipo</p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" aria-pressed={tipo === 'entrada'} onClick={() => trocarTipo('entrada')}
          className={`${BTN_BASE} ${tipo === 'entrada' ? 'bg-[#34C79D]' : 'bg-white'}`}>
          ↓ Entrou
        </button>
        <button type="button" aria-pressed={tipo === 'saida'} onClick={() => trocarTipo('saida')}
          className={`${BTN_BASE} ${tipo === 'saida' ? 'bg-[#FF7A6B]' : 'bg-white'}`}>
          ↑ Saiu
        </button>
      </div>

      <label htmlFor="valor" className="mt-6 mb-2 block text-[13px] font-bold uppercase tracking-wide text-[#5E5780]">Valor</label>
      <input id="valor" name="valor" inputMode="decimal" autoComplete="off" placeholder="R$ 0,00"
        className="h-[76px] w-full rounded-[14px] border-2 border-[#1F1B3A] bg-white text-center text-[40px] font-extrabold text-[#1F1B3A] tabular-nums placeholder:text-[#1F1B3A]/30 focus:outline focus:outline-[3px] focus:outline-offset-2 focus:outline-[#7B6CF6]" />

      <p className="mt-6 mb-2 text-[13px] font-bold uppercase tracking-wide text-[#5E5780]">
        {tipo === 'entrada' ? 'Categoria (entrada)' : 'Categoria (saída)'}
      </p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIAS[tipo].map((c) => (
          <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}
            className={`inline-flex min-h-[46px] items-center gap-2 rounded-full border-2 border-[#1F1B3A] px-4 text-[15px] font-bold text-[#1F1B3A] transition-[transform,box-shadow] duration-100 active:translate-y-[1px] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6] ${categoria === c ? 'bg-[#FFD25A] shadow-[0_2px_0_#1F1B3A]' : 'bg-white shadow-[0_2px_0_#1F1B3A]'}`}>
            <span aria-hidden className="h-3 w-3 rounded-full border-2 border-[#1F1B3A]" style={{ background: COR_CATEGORIA[c] ?? '#5BC0EB' }} />
            {c}
          </button>
        ))}
      </div>

      <label htmlFor="forma_pagamento" className="mt-6 mb-2 block text-[13px] font-bold uppercase tracking-wide text-[#5E5780]">
        Forma (de onde entrou / saiu)
      </label>
      <select id="forma_pagamento" name="forma_pagamento" defaultValue="Dinheiro"
        className="h-[46px] w-full rounded-[14px] border-2 border-[#1F1B3A] bg-white px-3 text-[15px] font-bold text-[#1F1B3A] focus:outline focus:outline-[3px] focus:outline-offset-2 focus:outline-[#7B6CF6]">
        <option value="Dinheiro">Dinheiro</option>
        <option value="PIX">PIX</option>
      </select>
      <p className="mt-1 text-[13px] font-semibold text-[#5E5780]">
        Dinheiro mexe no cofre da loja; PIX mexe na conta do banco.
      </p>

      <button type="submit"
        className={`${BTN_BASE} mt-6 min-h-[60px] w-full bg-[#FFD25A] text-[20px] shadow-[0_3px_0_#1F1B3A] hover:-translate-y-px active:translate-y-[2px] active:shadow-[0_1px_0_#1F1B3A]`}>
        Salvar movimentação
      </button>
    </form>
  )
}
