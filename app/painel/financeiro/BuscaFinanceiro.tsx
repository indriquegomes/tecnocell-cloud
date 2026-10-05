'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarPessoasSugestao, ultimoLancamentoDaPessoa } from './actions'

const sb = createClient()

export function BuscaFinanceiro({ params, lojaEfetiva, operaveis, formasOpc, contasOpc, categoriasOpc, camposData, labelCampo, temFiltro }: {
  params: Record<string, string | undefined>
  lojaEfetiva: string
  operaveis: { id: string; nome: string }[]
  formasOpc: string[]
  contasOpc: { id: string; nome: string }[]
  categoriasOpc: string[]
  camposData: string[]
  labelCampo: Record<string, string>
  temFiltro: boolean
}) {
  const inp = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
  const [pessoa, setPessoa] = useState(params.pessoa ?? '')
  const [opcoes, setOpcoes] = useState<{ label: string; value: string }[]>([])
  const [aberto, setAberto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const digitou = useRef(false)
  const box = useRef<HTMLDivElement>(null)
  const [forma, setForma] = useState(params.forma ?? '')
  const [conta, setConta] = useState(params.conta ?? '')
  const [categoria, setCategoria] = useState(params.categoria ?? '')
  const [status, setStatus] = useState(params.status ?? '')
  const [loja, setLoja] = useState(params.loja ?? lojaEfetiva)
  const [valorMin, setValorMin] = useState(params.valor_min ?? '')
  const [valorMax, setValorMax] = useState(params.valor_max ?? '')
  const [de, setDe] = useState(params.de ?? '')
  const [ate, setAte] = useState(params.ate ?? '')
  const [campo, setCampo] = useState(params.campo ?? 'data_vencimento')

  async function token() { const { data } = await sb.auth.getSession(); return data.session?.access_token ?? '' }

  useEffect(() => {
    if (!digitou.current) return
    const termo = pessoa.trim()
    if (!termo) { setOpcoes([]); setBuscando(false); return }
    setBuscando(true)
    let vivo = true
    const t = setTimeout(async () => {
      try { const res = await buscarPessoasSugestao(await token(), termo); if (vivo) { setOpcoes(res); setAberto(true) } }
      catch { if (vivo) setOpcoes([]) }
      finally { if (vivo) setBuscando(false) }
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [pessoa])

  useEffect(() => {
    const fechar = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  async function escolher(nome: string) {
    setPessoa(nome); setAberto(false); setOpcoes([])
    try {
      const ult = await ultimoLancamentoDaPessoa(await token(), nome)
      if (ult) {
        setForma(ult.forma_pagamento ?? '')
        setConta(ult.conta_id ?? '')
        setCategoria(ult.categoria ?? '')
        setStatus(ult.status === 'pago' ? 'pago' : ult.status === 'pendente' ? 'pendente' : '')
        setLoja(ult.loja_id ?? '')
        setValorMin(ult.valor != null ? String(ult.valor) : '')
        setValorMax('')
        setDe(ult.data_vencimento ? ult.data_vencimento.slice(0, 10) : '')
        setAte('')
      }
    } catch { }
  }

  return (
    <form method="GET" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {params.tipo && <input type="hidden" name="tipo" value={params.tipo} />}
      {params.busca && <input type="hidden" name="busca" value={params.busca} />}
      <div ref={box} className="relative">
        <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Cliente / Fornecedor</label>
        <input name="pessoa" value={pessoa} onChange={(e) => { digitou.current = true; setPessoa(e.target.value) }} onFocus={() => opcoes.length && setAberto(true)} placeholder="Digite o nome…" autoComplete="off" className={inp} />
        {aberto && pessoa.trim().length >= 1 && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full min-w-[20rem] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {buscando && opcoes.length === 0 ? <li className="px-3 py-2 text-sm text-gray-400">Buscando…</li>
              : opcoes.length === 0 ? <li className="px-3 py-2 text-sm text-gray-400">Nenhum resultado.</li>
              : opcoes.map((o, i) => (<li key={i}><button type="button" onMouseDown={(e) => { e.preventDefault(); escolher(o.value) }} className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-blue-50 transition">{o.label}</button></li>))}
          </ul>
        )}
      </div>
      <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Loja</label><select name="loja" value={loja} onChange={(e) => setLoja(e.target.value)} className={inp}>{operaveis.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}<option value="sem">Sem loja</option><option value="todas">Todas</option></select></div>
      <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Forma de pagamento</label><select name="forma" value={forma} onChange={(e) => setForma(e.target.value)} className={inp}><option value="">Todas</option>{formasOpc.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
      <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Conta</label><select name="conta" value={conta} onChange={(e) => setConta(e.target.value)} className={inp}><option value="">Todas</option>{contasOpc.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
      <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Categoria</label><select name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inp}><option value="">Todas</option>{categoriasOpc.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Situação</label><select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={inp}><option value="">Todos</option><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="vencido">Vencido</option></select></div>
      <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Valor de</label><input name="valor_min" type="number" step="0.01" value={valorMin} onChange={(e) => setValorMin(e.target.value)} placeholder="0,00" className={inp} /></div>
      <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Valor até</label><input name="valor_max" type="number" step="0.01" value={valorMax} onChange={(e) => setValorMax(e.target.value)} placeholder="0,00" className={inp} /></div>
      <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Filtrar período por</label><select name="campo" value={campo} onChange={(e) => setCampo(e.target.value)} className={inp}>{camposData.map((c) => <option key={c} value={c}>{labelCampo[c]}</option>)}</select></div>
      <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">De</label><input name="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inp} /></div>
      <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Até</label><input name="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={inp} /></div>
      <div className="flex items-end gap-2 sm:col-span-2">
        <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">Filtrar</button>
        {temFiltro && <a href="/painel/financeiro" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition">Limpar tudo</a>}
      </div>
    </form>
  )
}
