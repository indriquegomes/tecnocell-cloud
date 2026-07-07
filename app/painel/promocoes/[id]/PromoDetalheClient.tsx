'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  adicionarItensLotePromocao, adicionarFaixa, removerFaixa,
  removerItemPromocao, removerItensLotePromocao, togglePromocao, deletarPromocao,
} from '../actions'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const semAcento = (s: string) =>
  s.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
const casaBusca = (texto: string, busca: string) => {
  const t = semAcento(texto)
  return semAcento(busca).split(/\s+/).filter(Boolean).every((termo) => t.includes(termo))
}

type ProdutoCat = { id: string; nome: string; codigo: string | null; marca: string | null; preco: number; preco_custo: number }

const TIPO_LABEL: Record<string, string> = {
  valor_direto: 'Valor Direto',
  progressivo: 'Preço por Quantidade',
  leve_x_pague_y: 'Leve X Pague Y',
  acima_x_pague_y: 'Acima de X un. Pague Y',
}

type Faixa = { id: string; quantidade_minima: number; preco: number }

type ItemPromo = {
  id: string
  produto_id: string
  nome_produto: string
  preco_padrao: number
  preco_promocional: number | null
  quantidade_x: number | null
  quantidade_y: number | null
}

type Promocao = {
  id: string
  nome: string
  tipo: string
  valor: number
  data_inicio: string
  data_fim: string | null
  ativa: boolean
  descricao: string | null
  quantidade_x: number | null
  quantidade_y: number | null
}

export function PromoDetalheClient({
  promocao,
  itens,
  catalogo,
  jaNaPromo,
  faixas,
}: {
  promocao: Promocao
  itens: ItemPromo[]
  catalogo: ProdutoCat[]
  jaNaPromo: string[]
  faixas: Faixa[]
}) {
  const router = useRouter()
  const hoje = new Date().toISOString().split('T')[0]
  const expirada = !!promocao.data_fim && promocao.data_fim < hoje  // sem data_fim = nunca expira
  const ativa = promocao.ativa && !expirada
  const ehValorDireto = promocao.tipo === 'valor_direto'
  const ehProgressivo = promocao.tipo === 'progressivo'

  // ===== Faixas (tipo progressivo) =====
  const [faixaQtd, setFaixaQtd] = useState('')
  const [faixaPreco, setFaixaPreco] = useState('')
  const [salvandoFaixa, setSalvandoFaixa] = useState(false)
  const handleAddFaixa = async () => {
    const q = parseInt(faixaQtd, 10); const pr = parseFloat(faixaPreco.replace(',', '.'))
    if (!q || q < 1 || isNaN(pr) || pr < 0) return
    setSalvandoFaixa(true)
    await adicionarFaixa(promocao.id, q, Math.round(pr * 100) / 100)
    setFaixaQtd(''); setFaixaPreco(''); setSalvandoFaixa(false)
    router.refresh()
  }
  const handleRemoverFaixa = async (fid: string) => {
    await removerFaixa(fid, promocao.id)
    router.refresh()
  }

  const [removendo, setRemovendo] = useState<string | null>(null)
  const [confExcluir, setConfExcluir] = useState(false)

  // seleção pra remover em lote (checkbox na tabela de produtos da promoção)
  const [selRem, setSelRem] = useState<Set<string>>(new Set())
  const [removendoLote, setRemovendoLote] = useState(false)
  const toggleRem = (id: string) => setSelRem((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todosRem = itens.length > 0 && itens.every((i) => selRem.has(i.id))
  const marcarTodosRem = () => setSelRem(() => todosRem ? new Set() : new Set(itens.map((i) => i.id)))
  const handleRemoverLote = async () => {
    if (selRem.size === 0) return
    setRemovendoLote(true)
    await removerItensLotePromocao([...selRem], promocao.id)
    setSelRem(new Set()); setRemovendoLote(false)
    router.refresh()
  }

  // ===== Painel: adicionar em lote =====
  const jaSet = useMemo(() => new Set(jaNaPromo), [jaNaPromo])
  const [buscaLote, setBuscaLote] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [modo, setModo] = useState<'fixo' | 'pct' | 'margem'>('fixo')
  const [valorModo, setValorModo] = useState('')
  const [salvandoLote, setSalvandoLote] = useState(false)
  const [msgLote, setMsgLote] = useState('')

  const matches = useMemo(() => {
    const q = buscaLote.trim()
    if (!q) return []
    return catalogo.filter((p) => casaBusca(`${p.nome} ${p.codigo ?? ''} ${p.marca ?? ''}`, q))
  }, [buscaLote, catalogo])

  // preço promocional calculado por produto conforme o modo
  const precoDe = (p: ProdutoCat): number => {
    const v = parseFloat(valorModo.replace(',', '.')) || 0
    let preco = p.preco
    if (modo === 'fixo') preco = v
    else if (modo === 'pct') preco = p.preco * (1 - v / 100)
    else if (modo === 'margem') preco = p.preco_custo * v
    return Math.max(0, Math.round(preco * 100) / 100)
  }

  const toggleSel = (id: string) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todosMarcados = matches.length > 0 && matches.every((p) => sel.has(p.id))
  const marcarTodos = () => setSel((prev) => {
    const n = new Set(prev)
    if (todosMarcados) matches.forEach((p) => n.delete(p.id))
    else matches.forEach((p) => n.add(p.id))
    return n
  })

  const handleAdicionarLote = async () => {
    if (sel.size === 0) return
    setSalvandoLote(true); setMsgLote('')
    const byId = new Map(catalogo.map((p) => [p.id, p]))
    const itensLote = [...sel].map((id) => {
      const p = byId.get(id)!
      return { produto_id: id, preco: ehValorDireto ? precoDe(p) : ehProgressivo ? 0 : p.preco }
    })
    try {
      const n = await adicionarItensLotePromocao(promocao.id, itensLote)
      setMsgLote(`${n} produto${n !== 1 ? 's' : ''} adicionado${n !== 1 ? 's' : ''}.`)
      setSel(new Set()); setBuscaLote('')
      router.refresh()
    } catch {
      setMsgLote('Erro ao adicionar.')
    }
    setSalvandoLote(false)
  }

  const handleRemover = async (itemId: string) => {
    setRemovendo(itemId)
    await removerItemPromocao(itemId, promocao.id)
    setRemovendo(null)
    router.refresh()
  }

  const handleToggle = async () => {
    await togglePromocao(promocao.id, promocao.ativa)
    router.refresh()
  }

  const handleDeletar = async () => {
    await deletarPromocao(promocao.id)
  }

  const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : 'sem fim')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">{promocao.nome}</h2>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold
              ${ativa ? 'bg-green-100 text-green-700' : expirada ? 'bg-gray-100 text-gray-400' : 'bg-yellow-100 text-yellow-700'}`}>
              {ativa ? 'Ativa' : expirada ? 'Expirada' : 'Pausada'}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {TIPO_LABEL[promocao.tipo] ?? promocao.tipo}
            {promocao.tipo === 'leve_x_pague_y' && promocao.quantidade_x && promocao.quantidade_y &&
              ` · Leve ${promocao.quantidade_x} Pague ${promocao.quantidade_y}`}
            {promocao.tipo === 'acima_x_pague_y' && promocao.quantidade_x &&
              ` · Acima de ${promocao.quantidade_x} un. por ${fmt(promocao.valor)}/un.`}
            {' · '}{promocao.data_fim
              ? `${fmtDate(promocao.data_inicio)} até ${fmtDate(promocao.data_fim)}`
              : `a partir de ${fmtDate(promocao.data_inicio)} · sem prazo de fim`}
          </p>
          {promocao.descricao && <p className="mt-0.5 text-xs text-gray-400">{promocao.descricao}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          {!expirada && (
            <button onClick={handleToggle}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              {promocao.ativa ? 'Pausar' : 'Ativar'}
            </button>
          )}
          {confExcluir ? (
            <>
              <button onClick={handleDeletar}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition">
                Confirmar exclusão
              </button>
              <button onClick={() => setConfExcluir(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Cancelar
              </button>
            </>
          ) : (
            <button onClick={() => setConfExcluir(true)}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition">
              Excluir
            </button>
          )}
        </div>
      </div>

      {/* Faixas de quantidade (progressivo) */}
      {!expirada && ehProgressivo && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-semibold text-gray-800">Faixas de preço por quantidade</h3>
            <p className="text-xs text-gray-400 mt-0.5">O preço cai conforme a quantidade <b>total</b> dos produtos deste grupo no carrinho. Ex: 1un = R$4,00 · 10un = R$1,80 · 100un = R$1,70.</p>
          </div>
          {faixas.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr><th className="px-4 py-2">A partir de (un.)</th><th className="px-4 py-2 text-right">Preço unitário</th><th className="px-4 py-2" /></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {faixas.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{f.quantidade_minima} un+</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-green-600">{fmt(f.preco)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => handleRemoverFaixa(f.id)} className="text-xs text-red-400 hover:text-red-600 transition">Remover</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-400">A partir de (un.)</label>
              <input value={faixaQtd} onChange={(e) => setFaixaQtd(e.target.value)} type="number" min="1" placeholder="10" className="field w-full" />
            </div>
            <div className="w-40">
              <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-400">Preço unitário R$</label>
              <input value={faixaPreco} onChange={(e) => setFaixaPreco(e.target.value)} type="number" step="0.01" min="0" placeholder="1,80" className="field w-full" />
            </div>
            <button onClick={handleAddFaixa} disabled={salvandoFaixa || !faixaQtd || !faixaPreco}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition">
              {salvandoFaixa ? 'Salvando...' : '+ Faixa'}
            </button>
          </div>
        </div>
      )}

      {/* Adicionar em lote */}
      {!expirada && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-semibold text-gray-800">Adicionar Produtos em Lote</h3>
            <p className="text-xs text-gray-400 mt-0.5">Busque um grupo (ex: <b>frontal</b>, <b>pelicula 3d</b>, uma marca), marque todos e adicione de uma vez.</p>
          </div>

          {/* Busca + preço em lote */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-56">
              <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-400">Buscar grupo</label>
              <input value={buscaLote} onChange={(e) => setBuscaLote(e.target.value)}
                placeholder="Nome, código ou marca..." className="field w-full" />
            </div>
            {ehValorDireto && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-400">Preço em lote</label>
                  <div className="flex gap-1">
                    {([['fixo', 'R$'], ['pct', '% desc'], ['margem', 'custo×']] as const).map(([m, l]) => (
                      <button key={m} type="button" onClick={() => setModo(m)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${modo === m ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-28">
                  <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-400">
                    {modo === 'fixo' ? 'Valor R$' : modo === 'pct' ? '% desconto' : 'Multiplic.'}
                  </label>
                  <input value={valorModo} onChange={(e) => setValorModo(e.target.value)}
                    type="number" step="0.01" min="0" placeholder={modo === 'margem' ? '1.5' : '0,00'} className="field w-full" />
                </div>
              </>
            )}
          </div>

          {/* Resultados com checkbox */}
          {buscaLote.trim() && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={todosMarcados} onChange={marcarTodos}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                  Selecionar todos ({matches.length})
                </label>
                <span className="text-xs text-gray-400">{sel.size} marcado{sel.size !== 1 ? 's' : ''}</span>
              </div>
              <div className="max-h-72 overflow-auto divide-y divide-gray-50">
                {matches.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">Nenhum produto encontrado.</p>
                ) : matches.slice(0, 100).map((p) => (
                  <label key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50/40 cursor-pointer">
                    <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggleSel(p.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                    <span className="min-w-0 flex-1 truncate">
                      {p.codigo && <span className="mr-1.5 text-xs text-gray-400 tabular-nums">{p.codigo}</span>}
                      <span className="font-medium text-gray-800">{p.nome}</span>
                      {jaSet.has(p.id) && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">já na promoção</span>}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">{fmt(p.preco)}</span>
                    {ehValorDireto && valorModo && (
                      <span className="shrink-0 w-20 text-right text-xs font-semibold text-green-600">→ {fmt(precoDe(p))}</span>
                    )}
                  </label>
                ))}
                {matches.length > 100 && (
                  <p className="px-4 py-2 text-center text-xs text-gray-400">+{matches.length - 100} — refine a busca ou use &quot;Selecionar todos&quot; (pega os {matches.length})</p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={handleAdicionarLote} disabled={sel.size === 0 || salvandoLote || (ehValorDireto && !valorModo)}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition">
              {salvandoLote ? 'Adicionando...' : `+ Adicionar ${sel.size || ''} à promoção`}
            </button>
            {ehValorDireto && !valorModo && sel.size > 0 && <span className="text-xs text-amber-600">defina o preço em lote acima</span>}
            {msgLote && <span className={`text-sm font-medium ${msgLote.includes('Erro') ? 'text-red-600' : 'text-green-600'}`}>{msgLote}</span>}
          </div>
        </div>
      )}

      {/* Tabela de produtos */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-gray-800">Produtos na Promoção</h3>
          <div className="flex items-center gap-3">
            {selRem.size > 0 && (
              <button onClick={handleRemoverLote} disabled={removendoLote}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition">
                {removendoLote ? 'Removendo...' : `Remover ${selRem.size} selecionado${selRem.size !== 1 ? 's' : ''}`}
              </button>
            )}
            <span className="text-xs text-gray-400">{itens.length} produto{itens.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        {itens.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Nenhum produto adicionado ainda.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-6 py-3 w-10">
                  <input type="checkbox" checked={todosRem} onChange={marcarTodosRem}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600" title="Selecionar todos" />
                </th>
                <th className="px-6 py-3">Produto</th>
                <th className="px-6 py-3 text-right">Preço Padrão</th>
                {promocao.tipo === 'valor_direto' && <th className="px-6 py-3 text-right">Preço Promo</th>}
                {promocao.tipo === 'valor_direto' && <th className="px-6 py-3 text-right">Desconto</th>}
                {promocao.tipo !== 'valor_direto' && <th className="px-6 py-3 text-center">Condição</th>}
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itens.map(item => {
                const desconto = item.preco_padrao && item.preco_promocional
                  ? ((item.preco_padrao - item.preco_promocional) / item.preco_padrao * 100)
                  : 0
                return (
                  <tr key={item.id} className={`hover:bg-gray-50 ${selRem.has(item.id) ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-6 py-3">
                      <input type="checkbox" checked={selRem.has(item.id)} onChange={() => toggleRem(item.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                    </td>
                    <td className="px-6 py-3 font-medium text-gray-800">{item.nome_produto}</td>
                    <td className="px-6 py-3 text-right text-gray-500">{fmt(item.preco_padrao)}</td>
                    {promocao.tipo === 'valor_direto' && (
                      <>
                        <td className="px-6 py-3 text-right font-bold text-green-600">
                          {item.preco_promocional != null ? fmt(item.preco_promocional) : '—'}
                        </td>
                        <td className="px-6 py-3 text-right text-orange-500">
                          {desconto > 0 ? `-${desconto.toFixed(0)}%` : '—'}
                        </td>
                      </>
                    )}
                    {promocao.tipo !== 'valor_direto' && (
                      <td className="px-6 py-3 text-center text-gray-600">
                        {promocao.tipo === 'leve_x_pague_y'
                          ? `Leve ${promocao.quantidade_x} Pague ${promocao.quantidade_y}`
                          : promocao.tipo === 'progressivo'
                            ? `preço por faixa (${faixas.length} faixa${faixas.length !== 1 ? 's' : ''})`
                            : `Acima de ${promocao.quantidade_x} un.`}
                      </td>
                    )}
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => handleRemover(item.id)} disabled={removendo === item.id}
                        className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-40">
                        {removendo === item.id ? '...' : 'Remover'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
