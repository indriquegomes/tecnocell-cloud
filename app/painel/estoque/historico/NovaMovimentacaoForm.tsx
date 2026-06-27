'use client'

import { useState, useRef } from 'react'
import { registrarMovimentos } from '../actions'

type Deposito = { id: string; nome: string }
type Produto = { id: string; nome: string; codigo: string | null }
type ItemLista = { produtoBusca: string; quantidade: number; operacao: string }

const OP_LABEL: Record<string, string> = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste' }
const OP_CLS: Record<string, string> = {
  entrada: 'text-green-700 bg-green-50 border-green-200',
  saida:   'text-red-700 bg-red-50 border-red-200',
  ajuste:  'text-blue-700 bg-blue-50 border-blue-200',
}

export function NovaMovimentacaoForm({
  depositos,
  produtos,
  dataHoje,
  horaAgora,
}: {
  depositos: Deposito[]
  produtos: Produto[]
  dataHoje: string
  horaAgora: string
}) {
  const [itens, setItens] = useState<ItemLista[]>([])
  const [produtoBusca, setProdutoBusca] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [operacao, setOperacao] = useState('entrada')
  const prodInputRef = useRef<HTMLInputElement>(null)

  function adicionar() {
    const nome = produtoBusca.trim()
    if (!nome) return
    setItens(prev => [...prev, {
      produtoBusca: nome,
      quantidade: Math.max(1, Math.round(parseFloat(quantidade) || 1)),
      operacao,
    }])
    setProdutoBusca('')
    setQuantidade('1')
    prodInputRef.current?.focus()
  }

  return (
    <details className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <summary className="cursor-pointer select-none border-b border-gray-100 bg-gray-50 px-6 py-3 text-sm font-semibold text-blue-600 hover:bg-gray-100 transition flex items-center gap-2">
        Nova Movimentação Estoque
        <svg className="h-4 w-4 text-blue-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <form action={registrarMovimentos} className="p-6 space-y-5">
        {/* Depósito | Data | Horário */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Depósito *</label>
            <select name="deposito_id" required className="field">
              <option value="">*</option>
              {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Data Movimentação *</label>
            <input name="data_mov" type="date" required defaultValue={dataHoje} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Horário *</label>
            <input name="horario_mov" type="time" required defaultValue={horaAgora} className="field" />
          </div>
        </div>

        {/* Nota Fiscal */}
        <div className="max-w-sm">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Nota Fiscal</label>
          <input name="nota_fiscal" type="text" placeholder="Ex: 001234" className="field" />
        </div>

        {/* Input de item: Produto | Qtd | Tipo | + Adicionar */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Produto Selecionado</label>
          <div className="flex items-center gap-2">
            <input
              ref={prodInputRef}
              list="mov-produtos-list"
              value={produtoBusca}
              onChange={e => setProdutoBusca(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
              placeholder="Pesquise pelo nome dos produtos cadastrados"
              className="field flex-1"
              autoComplete="off"
            />
            <datalist id="mov-produtos-list">
              {produtos.map(p => (
                <option key={p.id} value={p.nome + (p.codigo ? ` (${p.codigo})` : '')} />
              ))}
            </datalist>
            <input
              type="number"
              value={quantidade}
              onChange={e => setQuantidade(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
              min="1"
              step="1"
              placeholder="Qtd"
              className="field w-24 text-center"
            />
            <select
              value={operacao}
              onChange={e => setOperacao(e.target.value)}
              className="field w-32"
            >
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="ajuste">Ajuste</option>
            </select>
            <button
              type="button"
              onClick={adicionar}
              disabled={!produtoBusca.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
            >
              + Adicionar
            </button>
          </div>
        </div>

        {/* Tabela dos itens adicionados */}
        {itens.length > 0 && (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto Selecionado</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Quantidade</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Tipo</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {itens.map((item, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2.5 text-sm text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-800">
                      {item.produtoBusca.replace(/\s*\([^)]*\)$/, '').trim()}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-semibold text-gray-900">
                      {item.quantidade}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${OP_CLS[item.operacao]}`}>
                        {OP_LABEL[item.operacao]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => setItens(prev => prev.filter((_, j) => j !== i))}
                        className="text-gray-300 hover:text-red-500 transition text-base leading-none font-bold"
                        title="Remover"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* JSON dos itens (enviado com o form) */}
        <input
          type="hidden"
          name="itens"
          value={JSON.stringify(itens.map(it => ({
            produto_busca: it.produtoBusca,
            quantidade: it.quantidade,
            operacao: it.operacao,
          })))}
        />

        {/* Anotações */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Anotações</label>
          <textarea name="observacao" rows={3} className="field resize-none" />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={itens.length === 0}
            className="rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Salvar{itens.length > 0 ? ` (${itens.length} ${itens.length === 1 ? 'item' : 'itens'})` : ''}
          </button>
        </div>
      </form>
    </details>
  )
}
