'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { adicionarItemNota } from '../actions'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Busca inteligente (igual PDV): sem acento, multi-palavra, em nome + código + marca.
// "fr a11" acha "FRONTAL ... A11"; "tam" acha "TAMPA".
const semAcento = (s: string) =>
  s.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
const casaBusca = (texto: string, busca: string) => {
  const t = semAcento(texto)
  return semAcento(busca).split(/\s+/).filter(Boolean).every((termo) => t.includes(termo))
}

type Produto = { id: string; nome: string; codigo: string | null; marca: string | null; preco_custo: number | null }
type Deposito = { id: string; nome: string; loja_id: string | null }
type Loja = { id: string; nome: string }

export function AddItemNota({ notaId, produtos, depositos, lojas }: {
  notaId: string; produtos: Produto[]; depositos: Deposito[]; lojas: Loja[]
}) {
  const router = useRouter()

  // grupos loja→depósitos (inclui "(sem loja)" p/ depósitos órfãos, ex: Estoque Geral)
  const grupos = useMemo(() => {
    const gs: { id: string; nome: string }[] = lojas.filter((l) => depositos.some((d) => d.loja_id === l.id))
    if (depositos.some((d) => !d.loja_id)) gs.push({ id: '', nome: '(sem loja)' })
    return gs
  }, [lojas, depositos])

  const [lojaSel, setLojaSel] = useState(grupos[0]?.id ?? '')
  const depsDaLoja = useMemo(() => depositos.filter((d) => (d.loja_id ?? '') === lojaSel), [depositos, lojaSel])
  const [depositoSel, setDepositoSel] = useState(depsDaLoja[0]?.id ?? '')

  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Produto | null>(null)
  const [qtd, setQtd] = useState('1')
  const [preco, setPreco] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const filtrados = useMemo(() => {
    const q = busca.trim()
    if (!q || sel) return []
    return produtos.filter((p) => casaBusca(`${p.nome} ${p.codigo ?? ''} ${p.marca ?? ''}`, q)).slice(0, 8)
  }, [busca, produtos, sel])

  const trocarLoja = (id: string) => {
    setLojaSel(id)
    const primeiro = depositos.find((d) => (d.loja_id ?? '') === id)
    setDepositoSel(primeiro?.id ?? '')
  }
  const escolher = (p: Produto) => { setSel(p); setBusca(p.nome); setPreco(p.preco_custo ? String(p.preco_custo) : '') }

  const adicionar = async () => {
    if (!sel || !depositoSel || !preco) return
    setSalvando(true); setErro('')
    const fd = new FormData()
    fd.set('produto_id', sel.id); fd.set('deposito_id', depositoSel)
    fd.set('quantidade', qtd || '1'); fd.set('preco_unitario', preco)
    try {
      await adicionarItemNota(notaId, fd)
      setBusca(''); setSel(null); setPreco(''); setQtd('1')
      router.refresh()
    } catch { setErro('Erro ao adicionar item.') }
    setSalvando(false)
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-800">Adicionar Item</h3>
      <div className="flex flex-wrap gap-4 items-end">
        <div className="relative flex-1 min-w-56">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Produto</label>
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setSel(null) }}
            className="field w-full" placeholder="Nome, código ou marca...  (ex: fr a11, pel samsung)" />
          {filtrados.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {filtrados.map((p) => (
                <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); escolher(p) }}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 hover:bg-blue-50 text-left text-sm">
                  <span className="min-w-0 truncate font-medium text-gray-800">
                    {p.codigo && <span className="mr-1.5 text-xs text-gray-400 tabular-nums">{p.codigo}</span>}
                    {p.nome}
                    {p.marca && <span className="ml-1.5 text-xs text-gray-400">· {p.marca}</span>}
                  </span>
                  <span className="shrink-0 text-gray-400 text-xs">custo {fmt(p.preco_custo ?? 0)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-40">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Loja (empresa)</label>
          <select value={lojaSel} onChange={(e) => trocarLoja(e.target.value)} className="field w-full">
            {grupos.map((g) => <option key={g.id || 'sem'} value={g.id}>{g.nome}</option>)}
          </select>
        </div>
        <div className="w-44">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Estoque (onde entra)</label>
          <select value={depositoSel} onChange={(e) => setDepositoSel(e.target.value)} className="field w-full">
            {depsDaLoja.length === 0 && <option value="">— sem estoque nesta loja —</option>}
            {depsDaLoja.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
        <div className="w-20">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Qtd</label>
          <input value={qtd} onChange={(e) => setQtd(e.target.value)} type="number" min="1" step="1" className="field w-full" />
        </div>
        <div className="w-36">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço Unit. (R$)</label>
          <input value={preco} onChange={(e) => setPreco(e.target.value)} type="number" step="0.01" min="0" className="field w-full" placeholder="0,00" />
          {sel && sel.preco_custo != null && Number(preco) !== Number(sel.preco_custo) && (
            <p className="mt-1 text-[11px] text-amber-600">era {fmt(sel.preco_custo)}{Number(preco) > Number(sel.preco_custo) ? ' ▲' : ' ▼'}</p>
          )}
        </div>
        <button onClick={adicionar} disabled={!sel || !depositoSel || !preco || salvando}
          className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
          {salvando ? 'Adicionando...' : 'Adicionar'}
        </button>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  )
}
