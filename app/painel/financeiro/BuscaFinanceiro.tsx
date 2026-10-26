'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { buscarPessoasSugestao } from './actions'

const sb = createClient()

const ROTULO_GRUPO: Record<string, string> = {
  funcionarios: 'Funcionários (folha)',
  freelancers: 'Freelancers (motoboy pontual)',
  fornecedores: 'Fornecedores',
  fixas: 'Contas fixas',
}

// Barra de filtro do Financeiro.
//
// Antes eram 14 campos sempre abertos, sem busca por texto (o motor existia mas o
// campo estava escondido) e sem resumo do que estava aplicado. Agora:
//   1. uma linha na frente: busca + loja + situação + período + Filtrar;
//   2. etiquetas do que está aplicado, cada uma com X para tirar só aquele filtro;
//   3. o resto atrás de "Mais filtros", fechado por padrão.
export function BuscaFinanceiro({ params, lojaEfetiva, operaveis, formasOpc, contasOpc, categoriasGrupos, camposData, labelCampo, temFiltro }: {
  params: Record<string, string | undefined>
  lojaEfetiva: string
  operaveis: { id: string; nome: string }[]
  formasOpc: string[]
  contasOpc: { id: string; nome: string }[]
  categoriasGrupos: { grupo: string; categorias: string[] }[]
  camposData: string[]
  labelCampo: Record<string, string>
  temFiltro: boolean
}) {
  const inp = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
  const [busca, setBusca] = useState(params.busca ?? '')
  const [pessoa, setPessoa] = useState(params.pessoa ?? '')
  const [opcoes, setOpcoes] = useState<{ label: string; value: string }[]>([])
  const [aberto, setAberto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const digitou = useRef(false)
  const box = useRef<HTMLDivElement>(null)
  const [forma, setForma] = useState(params.forma ?? '')
  const [conta, setConta] = useState(params.conta ?? '')
  const [categoria, setCategoria] = useState(params.categoria ?? '')
  const [grupo, setGrupo] = useState(params.grupo ?? '')
  const [status, setStatus] = useState(params.status ?? '')
  const [loja, setLoja] = useState(params.loja ?? lojaEfetiva)
  const [valorMin, setValorMin] = useState(params.valor_min ?? '')
  const [valorMax, setValorMax] = useState(params.valor_max ?? '')
  const [de, setDe] = useState(params.de ?? '')
  const [ate, setAte] = useState(params.ate ?? '')
  const [campo, setCampo] = useState(params.campo ?? 'data_vencimento')
  // "Tudo (histórico)" precisa viajar como parâmetro: só apagar de/ate volta para o
  // mês atual, e a opção virava um clique que não fazia nada.
  const [tudo, setTudo] = useState(params.tudo === '1' ? '1' : '')

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

  // Escolher a pessoa NÃO apaga mais os outros filtros: antes limpava loja, forma,
  // categoria, mês e valor sem avisar, e o dono achava que estava filtrando o mês.
  function escolher(nome: string) {
    setPessoa(nome); setAberto(false); setOpcoes([])
  }

  const formRef = useRef<HTMLFormElement>(null)
  const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const meses = useMemo(() => {
    const lista: { label: string; de: string; ate: string }[] = []
    const agora = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
      const ano = d.getFullYear()
      const m = d.getMonth()
      const ultimo = new Date(ano, m + 1, 0).getDate()
      lista.push({
        label: `${NOMES_MES[m]}/${ano}`,
        de: `${ano}-${String(m + 1).padStart(2, '0')}-01`,
        ate: `${ano}-${String(m + 1).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`,
      })
    }
    return lista
  }, [])

  const mesAtivo = tudo === '1' ? 'tudo' : String(Math.max(0, meses.findIndex((m) => m.de === de)))
  const mesPadrao = meses[0]

  function aplicarMes(m: { label: string; de: string; ate: string }) {
    setTudo('')
    setDe(m.de)
    setAte(m.ate)
    setTimeout(() => formRef.current?.requestSubmit(), 0)
  }

  // Link que tira UM filtro e mantém todo o resto (inclusive o tipo da aba).
  function semFiltro(chaves: string[]) {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (!v || k === 'pagina' || chaves.includes(k)) continue
      sp.set(k, v)
    }
    const qs = sp.toString()
    return '/painel/financeiro' + (qs ? '?' + qs : '')
  }

  type Etiqueta = { chave: string; label: string; href: string }
  const etiquetas: Etiqueta[] = []
  if (params.busca) etiquetas.push({ chave: 'busca', label: 'Busca: ' + params.busca, href: semFiltro(['busca']) })
  if (params.pessoa) etiquetas.push({ chave: 'pessoa', label: 'Pessoa: ' + params.pessoa, href: semFiltro(['pessoa']) })
  if (params.loja) {
    const nome = params.loja === 'sem' ? 'Sem loja' : params.loja === 'todas' ? 'Todas as lojas' : (operaveis.find((l) => l.id === params.loja)?.nome ?? 'Loja')
    etiquetas.push({ chave: 'loja', label: nome, href: semFiltro(['loja']) })
  }
  if (params.status) etiquetas.push({ chave: 'status', label: params.status.charAt(0).toUpperCase() + params.status.slice(1), href: semFiltro(['status']) })
  if (params.forma) etiquetas.push({ chave: 'forma', label: 'Forma: ' + params.forma, href: semFiltro(['forma']) })
  if (params.conta) etiquetas.push({ chave: 'conta', label: 'Conta: ' + (contasOpc.find((c) => c.id === params.conta)?.nome ?? 'conta'), href: semFiltro(['conta']) })
  if (params.categoria) etiquetas.push({ chave: 'categoria', label: params.categoria, href: semFiltro(['categoria']) })
  if (params.grupo) etiquetas.push({ chave: 'grupo', label: ROTULO_GRUPO[params.grupo] ?? params.grupo, href: semFiltro(['grupo']) })
  if (params.valor_min) etiquetas.push({ chave: 'valor_min', label: 'Valor ≥ ' + params.valor_min, href: semFiltro(['valor_min']) })
  if (params.valor_max) etiquetas.push({ chave: 'valor_max', label: 'Valor ≤ ' + params.valor_max, href: semFiltro(['valor_max']) })
  if (params.campo && params.campo !== 'data_vencimento') etiquetas.push({ chave: 'campo', label: 'Data: ' + (labelCampo[params.campo] ?? params.campo), href: semFiltro(['campo']) })
  const foraDoMesAtual = !!de && (de !== mesPadrao.de || ate !== mesPadrao.ate)
  if (tudo === '1') etiquetas.push({ chave: 'tudo', label: 'Histórico inteiro', href: semFiltro(['tudo', 'de', 'ate']) })
  else if (foraDoMesAtual) {
    const fmt = (d: string) => (d || '').slice(0, 10).split('-').reverse().join('/')
    etiquetas.push({ chave: 'periodo', label: fmt(de) + ' a ' + fmt(ate), href: semFiltro(['de', 'ate']) })
  }

  const maisFiltrosAbertos = !!(params.pessoa || params.forma || params.conta || params.categoria || params.grupo || params.valor_min || params.valor_max || (params.campo && params.campo !== 'data_vencimento'))

  return (
    <form ref={formRef} method="GET" className="space-y-3">
      {params.tipo && <input type="hidden" name="tipo" value={params.tipo} />}
      {tudo === '1' && <input type="hidden" name="tudo" value="1" />}

      {/* Linha 1 — o que se usa toda hora */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[16rem] flex-1">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Buscar</label>
          <input name="busca" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, descrição ou nº da nota…" autoComplete="off" className={inp} />
        </div>
        <div className="w-40">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Loja</label>
          <select name="loja" value={loja} onChange={(e) => setLoja(e.target.value)} className={inp}>
            {operaveis.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            <option value="sem">Sem loja</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div className="w-36">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Situação</label>
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={inp}>
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="vencido">Vencido</option>
          </select>
        </div>
        <div className="w-36">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Período</label>
          <select value={mesAtivo} onChange={(e) => { const v = e.target.value; if (v === 'tudo') { setTudo('1'); setDe(''); setAte(''); setTimeout(() => formRef.current?.requestSubmit(), 0) } else aplicarMes(meses[Number(v)]) }} className={inp}>
            {meses.map((m, i) => <option key={m.label} value={i}>{i === 0 ? m.label + ' (atual)' : m.label}</option>)}
            <option value="tudo">🗂️ Tudo (histórico)</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-blue-600 px-5 py-[9px] text-sm font-semibold text-white hover:bg-blue-700 transition">Filtrar</button>
        {temFiltro && <Link href="/painel/financeiro" className="rounded-lg border border-gray-200 px-4 py-[9px] text-sm text-gray-500 hover:bg-gray-50 transition">Limpar tudo</Link>}
      </div>
      <input type="hidden" name="de" value={de} />
      <input type="hidden" name="ate" value={ate} />

      {/* Etiquetas do que está aplicado */}
      {etiquetas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase text-gray-400">Filtrando por</span>
          {etiquetas.map((et) => (
            <Link key={et.chave} href={et.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition">
              {et.label}<span className="text-blue-400">✕</span>
            </Link>
          ))}
        </div>
      )}

      {/* Mais filtros — fechado por padrão */}
      <details open={maisFiltrosAbertos} className="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
        <summary className="cursor-pointer select-none text-sm font-semibold text-gray-600">Mais filtros</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Forma de pagamento</label><select name="forma" value={forma} onChange={(e) => setForma(e.target.value)} className={inp}><option value="">Todas</option>{formasOpc.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Conta</label><select name="conta" value={conta} onChange={(e) => setConta(e.target.value)} className={inp}><option value="">Todas</option>{contasOpc.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Categoria</label><select name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inp}><option value="">Todas</option>{categoriasGrupos.map((g) => <optgroup key={g.grupo} label={g.grupo}>{g.categorias.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>)}</select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Grupo</label><select name="grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)} className={inp}><option value="">Todos</option><option value="funcionarios">👥 Funcionários (folha)</option><option value="freelancers">🎒 Freelancers (motoboy pontual)</option><option value="fornecedores">🏭 Fornecedores</option><option value="fixas">📌 Contas fixas</option></select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Valor de</label><input name="valor_min" type="number" step="0.01" value={valorMin} onChange={(e) => setValorMin(e.target.value)} placeholder="0,00" className={inp} /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Valor até</label><input name="valor_max" type="number" step="0.01" value={valorMax} onChange={(e) => setValorMax(e.target.value)} placeholder="0,00" className={inp} /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Filtrar período por</label><select name="campo" value={campo} onChange={(e) => setCampo(e.target.value)} className={inp}>{camposData.map((c) => <option key={c} value={c}>{labelCampo[c]}</option>)}</select></div>
        </div>
      </details>
    </form>
  )
}
