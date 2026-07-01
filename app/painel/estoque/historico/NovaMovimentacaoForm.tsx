'use client'

import { useState, useRef } from 'react'
import { registrarMovimentos } from '../actions'

type Deposito = { id: string; nome: string }
type Produto = { id: string; nome: string; codigo: string | null; controla_serie: boolean | null }
type ItemLista = { produtoBusca: string; quantidade: number; operacao: string; imeis?: string[] }

const OP_LABEL: Record<string, string> = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste' }
const OP_CLS: Record<string, string> = {
  entrada: 'text-green-700 bg-green-50 border-green-200',
  saida:   'text-red-700 bg-red-50 border-red-200',
  ajuste:  'text-blue-700 bg-blue-50 border-blue-200',
}

// Casa o texto digitado ("Nome (codigo)" ou só "Nome") com um produto cadastrado
function acharProduto(produtos: Produto[], busca: string): Produto | null {
  const alvo = busca.trim().toLowerCase()
  if (!alvo) return null
  const semCodigo = alvo.replace(/\s*\([^)]*\)$/, '').trim()
  return (
    produtos.find(p => (p.nome + (p.codigo ? ` (${p.codigo})` : '')).toLowerCase() === alvo) ??
    produtos.find(p => p.nome.toLowerCase() === semCodigo) ??
    produtos.find(p => p.nome.toLowerCase().startsWith(semCodigo)) ??
    null
  )
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
  const [imeis, setImeis] = useState<string[]>([])
  const [imeiInput, setImeiInput] = useState('')
  const prodInputRef = useRef<HTMLInputElement>(null)
  const imeiInputRef = useRef<HTMLInputElement>(null)

  const prodMatch = acharProduto(produtos, produtoBusca)
  const serializado = !!prodMatch?.controla_serie && operacao === 'entrada'

  function addImei() {
    const s = imeiInput.trim()
    if (!s) return
    if (imeis.includes(s)) { setImeiInput(''); return } // não duplica na mesma entrada
    setImeis(prev => [...prev, s])
    setImeiInput('')
    imeiInputRef.current?.focus()
  }

  function limparInput() {
    setProdutoBusca('')
    setQuantidade('1')
    setImeis([])
    setImeiInput('')
    prodInputRef.current?.focus()
  }

  function adicionar() {
    const nome = produtoBusca.trim()
    if (!nome) return
    if (serializado) {
      if (imeis.length === 0) { imeiInputRef.current?.focus(); return }
      setItens(prev => [...prev, { produtoBusca: nome, quantidade: imeis.length, operacao: 'entrada', imeis }])
    } else {
      setItens(prev => [...prev, {
        produtoBusca: nome,
        quantidade: Math.max(1, Math.round(parseFloat(quantidade) || 1)),
        operacao,
      }])
    }
    limparInput()
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
        <div className="grid grid-cols-[1fr_100px_140px_auto] gap-2 items-end">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome do Produto</label>
            <input
              ref={prodInputRef}
              list="mov-produtos-list"
              value={produtoBusca}
              onChange={e => setProdutoBusca(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); serializado ? imeiInputRef.current?.focus() : adicionar() } }}
              placeholder="Pesquise pelo nome dos produtos cadastrados"
              className="field"
              autoComplete="off"
            />
            <datalist id="mov-produtos-list">
              {produtos.map(p => (
                <option key={p.id} value={p.nome + (p.codigo ? ` (${p.codigo})` : '')} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Qtd</label>
            <input
              type="number"
              value={serializado ? imeis.length : quantidade}
              onChange={e => setQuantidade(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
              min="1"
              step="1"
              disabled={serializado}
              className="field text-center disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Tipo</label>
            <select
              value={operacao}
              onChange={e => setOperacao(e.target.value)}
              className="field"
            >
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </div>
          <button
            type="button"
            onClick={adicionar}
            disabled={!produtoBusca.trim() || (serializado && imeis.length === 0)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
          >
            + Adicionar
          </button>
        </div>

        {/* Captura de IMEIs (só produto serializado em Entrada) */}
        {serializado && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M9 16H5v4m8-15V4a1 1 0 011-1h5a1 1 0 011 1v11a1 1 0 01-1 1h-5a1 1 0 01-1-1z" />
              </svg>
              {prodMatch?.nome} controla número de série — bipe ou digite cada IMEI:
            </div>
            <div className="flex gap-2 max-w-md">
              <input
                ref={imeiInputRef}
                value={imeiInput}
                onChange={e => setImeiInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addImei() } }}
                placeholder="IMEI / número de série + Enter"
                className="field flex-1"
                autoComplete="off"
                inputMode="numeric"
              />
              <button
                type="button"
                onClick={addImei}
                disabled={!imeiInput.trim()}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40 transition whitespace-nowrap"
              >
                + IMEI
              </button>
            </div>
            {imeis.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {imeis.map((im, i) => (
                  <span key={im} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-mono text-amber-900">
                    {im}
                    <button type="button" onClick={() => setImeis(prev => prev.filter((_, j) => j !== i))} className="text-amber-400 hover:text-red-500 leading-none font-bold">✕</button>
                  </span>
                ))}
                <span className="inline-flex items-center rounded-full bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white">
                  {imeis.length} {imeis.length === 1 ? 'aparelho' : 'aparelhos'}
                </span>
              </div>
            )}
          </div>
        )}

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
                    <td className="px-4 py-2.5 text-sm text-gray-400 align-top">{i + 1}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-800">
                      {item.produtoBusca.replace(/\s*\([^)]*\)$/, '').trim()}
                      {item.imeis && item.imeis.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {item.imeis.map(im => (
                            <span key={im} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-mono text-amber-800 border border-amber-200">{im}</span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-semibold text-gray-900 align-top">
                      {item.quantidade}
                    </td>
                    <td className="px-4 py-2.5 text-center align-top">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${OP_CLS[item.operacao]}`}>
                        {OP_LABEL[item.operacao]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center align-top">
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
            ...(it.imeis && it.imeis.length > 0 ? { imeis: it.imeis } : {}),
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
