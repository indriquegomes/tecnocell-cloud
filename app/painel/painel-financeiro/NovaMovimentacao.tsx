'use client'

// Tela "Nova movimentação" — fiel ao protótipo aprovado:
//   campo de valor .in: 76px de altura, raio 16, 40px/800 centralizado;
//   tipo: dois botões .bt (branco / verde-menta / coral); chips pílula com
//   bolinha colorida (.chip/.chip.on); botão salvar 60px/20px.
// O campo "Forma" é o único acréscimo em relação ao protótipo: sem ele o
// dinheiro não cai em conta nenhuma e o total do mês não mudaria.

import { useState } from 'react'
import { salvarMovimentacao } from './actions'

const CATEGORIAS: Record<'entrada' | 'saida', string[]> = {
  entrada: ['Venda', 'Serviço', 'Outros'],
  saida: ['Peças', 'Salários', 'Aluguel', 'Contas', 'Impostos', 'Outros'],
}

const COR: Record<string, string> = {
  Venda: '#34C79D', Serviço: '#5BC0EB', Outros: '#C9C2E3',
  Peças: '#FF7A6B', Salários: '#34C79D', Aluguel: '#5BC0EB',
  Contas: '#FFD25A', Impostos: '#7B6CF6',
}

const BTN = 'inline-flex min-h-[46px] items-center justify-center rounded-[14px] border-2 border-[#1F1B3A] px-[18px] text-[14px] font-bold text-[#1F1B3A] shadow-[0_3px_0_#1F1B3A] transition-[transform,box-shadow] duration-100 hover:-translate-y-px active:translate-y-[2px] active:shadow-[0_1px_0_#1F1B3A] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]'
const CARD = 'rounded-[18px] border-2 border-[#1F1B3A] bg-white shadow-[0_3px_0_#1F1B3A]'

export function NovaMovimentacao() {
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('saida')
  const [categoria, setCategoria] = useState('Peças')

  const trocarTipo = (t: 'entrada' | 'saida') => {
    setTipo(t)
    setCategoria(t === 'entrada' ? 'Venda' : 'Peças')
  }

  return (
    <form action={salvarMovimentacao} className={`${CARD} flex w-full max-w-[640px] flex-col gap-[18px] p-6`}>
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="categoria" value={categoria} />

      <div className="grid grid-cols-2 gap-3">
        <button type="button" aria-pressed={tipo === 'entrada'} onClick={() => trocarTipo('entrada')}
          className={`${BTN} ${tipo === 'entrada' ? 'bg-[#34C79D]' : 'bg-white'}`}>Entrou</button>
        <button type="button" aria-pressed={tipo === 'saida'} onClick={() => trocarTipo('saida')}
          className={`${BTN} ${tipo === 'saida' ? 'bg-[#FF7A6B]' : 'bg-white'}`}>Saiu</button>
      </div>

      <div>
        <label htmlFor="valor" className="text-[13px] font-semibold text-[#5E5780]">Valor</label>
        <input id="valor" name="valor" inputMode="decimal" autoComplete="off" placeholder="R$ 0,00"
          className="h-[76px] w-full rounded-[16px] border-2 border-[#1F1B3A] bg-white text-center text-[40px] font-extrabold tabular-nums text-[#1F1B3A] placeholder:text-[#1F1B3A]/25 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]" />
      </div>

      <div>
        <div className="mb-2 text-[13px] font-semibold text-[#5E5780]">Categoria</div>
        <div className="flex flex-wrap gap-2.5">
          {CATEGORIAS[tipo].map((c) => (
            <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}
              className={`flex min-h-[46px] items-center gap-2 rounded-full border-2 border-[#1F1B3A] px-4 text-[14px] font-bold text-[#1F1B3A] shadow-[0_2px_0_#1F1B3A] transition-[transform,box-shadow] duration-100 active:translate-y-[1px] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6] ${categoria === c ? 'bg-[#FFD25A]' : 'bg-white'}`}>
              <span aria-hidden className="h-3.5 w-3.5 rounded-full border-2 border-[#1F1B3A]" style={{ background: COR[c] ?? '#5BC0EB' }} />
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="forma_pagamento" className="text-[13px] font-semibold text-[#5E5780]">Forma</label>
        <select id="forma_pagamento" name="forma_pagamento" defaultValue="Dinheiro"
          className="mt-0.5 h-[46px] w-full rounded-[14px] border-2 border-[#1F1B3A] bg-white px-3 text-[14px] font-bold text-[#1F1B3A] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]">
          <option value="Dinheiro">Dinheiro</option>
          <option value="PIX">PIX</option>
        </select>
        <p className="mt-1 text-[12px] font-semibold text-[#5E5780]">Dinheiro mexe no cofre da loja; PIX mexe na conta do banco.</p>
      </div>

      <button type="submit" className={`${BTN} min-h-[60px] w-full bg-[#FFD25A] text-[20px]`}>Salvar movimentação</button>
    </form>
  )
}
