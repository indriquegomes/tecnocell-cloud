'use client'

import { BuscaProduto, type ProdutoBusca } from '@/components/BuscaProduto'
import { useState, useRef } from 'react'
import { SubmitButton } from '@/components/SubmitButton'
import { criarRemessa } from '../actions'

type Deposito = { id: string; nome: string }
type Produto = { id: string; nome: string; codigo: string | null; controla_serie: boolean | null }
type ItemRemessa = { produto_id: string; nome: string; quantidade: number; series: string[] }

function acharProduto(produtos: Produto[], busca: string): Produto | null {
  const alvo = busca.trim().toLowerCase()
  if (!alvo) return null
  const semCodigo = alvo.replace(/\s*\([^)]*\)$/, '').trim()
  return (
    produtos.find(p => (p.nome + (p.codigo ? ' (' + p.codigo + ')' : '')).toLowerCase() === alvo) ??
    produtos.find(p => p.nome.toLowerCase() === semCodigo) ??
    produtos.find(p => p.nome.toLowerCase().startsWith(semCodigo)) ??
    null
  )
}

export function TransferenciaForm({
  depositos,
  produtos,
  seriesPorProduto,
}: {
  depositos: Deposito[]
  produtos: Produto[]
  seriesPorProduto: Record<string, Record<string, string[]>>
}) {
  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState('')
  const [itens, setItens] = useState<ItemRemessa[]>([])
  // estado do item "sendo adicionado" agora
  const [produtoBusca, setProdutoBusca] = useState('')
  const [achados, setAchados] = useState<ProdutoBusca[]>([])
  const [quantidade, setQuantidade] = useState('1')
  const [series, setSeries] = useState<string[]>([])
  const [imeiInput, setImeiInput] = useState('')
  const [imeiErro, setImeiErro] = useState('')
  const imeiRef = useRef<HTMLInputElement>(null)

  const prodMatch = acharProduto([...achados, ...produtos], produtoBusca)
  const serializado = !!prodMatch?.controla_serie
  const disponiveis = serializado && prodMatch && origem ? (seriesPorProduto[prodMatch.id]?.[origem] ?? []) : []

  function addImei() {
    const s = imeiInput.trim()
    if (!s) return
    if (!disponiveis.includes(s)) {
      setImeiErro('IMEI "' + s + '" não está em estoque na origem.')
      setImeiInput('')
      return
    }
    setImeiErro('')
    if (!series.includes(s)) setSeries(prev => [...prev, s])
    setImeiInput('')
    imeiRef.current?.focus()
  }

  function adicionar() {
    if (!prodMatch || !origem) return
    if (serializado && series.length === 0) { setImeiErro('Escolha ao menos um IMEI.'); return }
    if (!serializado && (Math.round(parseFloat(quantidade) || 0) < 1)) { setImeiErro('Quantidade mínima: 1.'); return }
    const qtd = serializado ? series.length : Math.round(parseFloat(quantidade) || 0)
    setItens(prev => [...prev, { produto_id: prodMatch.id, nome: prodMatch.nome, quantidade: qtd, series: [...series] }])
    setProdutoBusca(''); setAchados([]); setSeries([]); setQuantidade('1'); setImeiErro(''); setImeiInput('')
  }

  function remover(idx: number) {
    setItens(prev => prev.filter((_, i) => i !== idx))
  }

  const mesmoDeposito = !!origem && origem === destino
  const podeEnviar = !!origem && !!destino && !mesmoDeposito && itens.length > 0

  return (
    <form action={criarRemessa} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
      {/* Origem → Destino */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Depósito de origem *</label>
          <select name="origem_id" required value={origem} onChange={e => { setOrigem(e.target.value); setSeries([]) }} className="field">
            <option value="">Selecione</option>
            {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
        <div className="pb-2 text-gray-400">→</div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Depósito de destino *</label>
          <select name="destino_id" required value={destino} onChange={e => setDestino(e.target.value)} className="field">
            <option value="">Selecione</option>
            {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
      </div>
      {mesmoDeposito && <p className="text-xs text-red-600">Origem e destino devem ser diferentes.</p>}

      {/* Adicionar item */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Adicionar item</p>
        <div className="grid grid-cols-[1fr_110px_auto] gap-3 items-end">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Produto</label>
            <BuscaProduto
              name="produto_busca"
              valor={produtoBusca}
              onChange={(t) => { setProdutoBusca(t); setSeries([]) }}
              onSelecionar={() => setSeries([])}
              onAchados={setAchados}
            />
          </div>
          {!serializado && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Qtd</label>
              <input value={quantidade} onChange={e => setQuantidade(e.target.value)}
                type="number" min="1" step="1" className="field text-center" />
            </div>
          )}
          <button type="button" onClick={adicionar} disabled={!prodMatch}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
            + Adicionar
          </button>
        </div>

        {serializado && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-800">
              {prodMatch?.nome} controla IMEI — escolha os aparelhos{origem ? '' : ' (selecione a origem primeiro)'}:
            </p>
            {origem && (
              <>
                <div className="flex gap-2 max-w-md">
                  <input ref={imeiRef} value={imeiInput}
                    onChange={e => setImeiInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addImei() } }}
                    placeholder="Bipe o IMEI + Enter" className="field flex-1" autoComplete="off" inputMode="numeric" />
                  <span className="inline-flex items-center rounded-full bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white whitespace-nowrap">
                    {series.length} escolhido{series.length === 1 ? '' : 's'}
                  </span>
                </div>
                {imeiErro && <p className="text-[11px] font-medium text-red-600">{imeiErro}</p>}
                {disponiveis.length === 0 ? (
                  <p className="text-[11px] text-amber-700">Nenhum IMEI em estoque na origem.</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {disponiveis.map(s => {
                      const on = series.includes(s)
                      return (
                        <button key={s} type="button"
                          onClick={() => setSeries(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-mono transition ${on ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'}`}>
                          {on ? '✓ ' : ''}{s}
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Itens adicionados */}
      {itens.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Item</th>
                <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">Qtd</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-400"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itens.map((it, i) => (
                <tr key={i} className="hover:bg-blue-50/40 transition">
                  <td className="px-4 py-2 text-gray-800">
                    {it.nome}
                    {it.series.length > 0 && <span className="ml-2 text-xs text-gray-400">{it.series.join(', ')}</span>}
                  </td>
                  <td className="px-4 py-2 text-center font-semibold text-gray-700">{it.quantidade}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" onClick={() => remover(i)} className="text-xs font-semibold text-red-600 hover:underline">Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Observação */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Observação</label>
        <input name="observacao" type="text" placeholder="Ex: reposição da loja" className="field" />
      </div>

      <input type="hidden" name="itens" value={JSON.stringify(itens)} />

      <SubmitButton
        disabled={!podeEnviar}
        pendingText="Enviando…"
        className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {'Enviar remessa (' + itens.length + (itens.length === 1 ? ' item' : ' itens') + ')'}
      </SubmitButton>
    </form>
  )
}
