'use client'

import { useState, useRef } from 'react'
import { SubmitButton } from '@/components/SubmitButton'
import { transferirEstoque } from '../actions'

type Deposito = { id: string; nome: string }
type Produto = { id: string; nome: string; codigo: string | null; controla_serie: boolean | null }

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
  const [produtoBusca, setProdutoBusca] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [series, setSeries] = useState<string[]>([])
  const [imeiInput, setImeiInput] = useState('')
  const [imeiErro, setImeiErro] = useState('')
  const imeiRef = useRef<HTMLInputElement>(null)

  const prodMatch = acharProduto(produtos, produtoBusca)
  const serializado = !!prodMatch?.controla_serie
  const disponiveis = serializado && prodMatch && origem ? (seriesPorProduto[prodMatch.id]?.[origem] ?? []) : []

  function addImei() {
    const s = imeiInput.trim()
    if (!s) return
    if (!disponiveis.includes(s)) {
      setImeiErro(`IMEI "${s}" não está em estoque na origem.`)
      setImeiInput('')
      return
    }
    setImeiErro('')
    if (!series.includes(s)) setSeries(prev => [...prev, s])
    setImeiInput('')
    imeiRef.current?.focus()
  }

  const mesmoDeposito = !!origem && origem === destino
  const podeEnviar = !!prodMatch && !!origem && !!destino && !mesmoDeposito &&
    (serializado ? series.length > 0 : Math.round(parseFloat(quantidade) || 0) >= 1)

  return (
    <form action={transferirEstoque} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
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

      {/* Produto | Qtd */}
      <div className="grid grid-cols-[1fr_120px] gap-3 items-end">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Produto *</label>
          <input
            list="transf-produtos"
            name="produto_busca"
            value={produtoBusca}
            onChange={e => { setProdutoBusca(e.target.value); setSeries([]) }}
            placeholder="Pesquise pelo nome do produto"
            className="field"
            autoComplete="off"
            required
          />
          <datalist id="transf-produtos">
            {produtos.map(p => <option key={p.id} value={p.nome + (p.codigo ? ` (${p.codigo})` : '')} />)}
          </datalist>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Qtd</label>
          <input
            name="quantidade"
            type="number"
            min="1"
            step="1"
            value={serializado ? series.length : quantidade}
            onChange={e => setQuantidade(e.target.value)}
            disabled={serializado}
            className="field text-center disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
      </div>

      {/* IMEIs (produto serializado) */}
      {serializado && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-800">
            {prodMatch?.nome} controla número de série — escolha os aparelhos a transferir{origem ? '' : ' (selecione a origem primeiro)'}:
          </p>
          {origem && (
            <>
              <div className="flex gap-2 max-w-md">
                <input
                  ref={imeiRef}
                  value={imeiInput}
                  onChange={e => setImeiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addImei() } }}
                  placeholder="Bipe o IMEI + Enter"
                  className="field flex-1"
                  autoComplete="off"
                  inputMode="numeric"
                />
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

      {/* Observação */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Observação</label>
        <input name="observacao" type="text" placeholder="Ex: reposição da loja" className="field" />
      </div>

      <input type="hidden" name="series" value={JSON.stringify(series)} />

      <SubmitButton
        disabled={!podeEnviar}
        pendingText="Transferindo…"
        className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Transferir{serializado && series.length > 0 ? ` ${series.length} aparelho${series.length === 1 ? '' : 's'}` : ''}
      </SubmitButton>
    </form>
  )
}
