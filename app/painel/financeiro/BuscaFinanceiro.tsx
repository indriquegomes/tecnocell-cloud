'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { sugerirFinanceiro, type SugestaoBusca } from './actions'

const sb = createClient()

// BARRA DE FILTRO DO FINANCEIRO — uma caixa de busca que acha, e nada duplicado.
//
// Como funciona: você digita "sa" e aparece o que existe de verdade nos seus dados
// (categoria Salários com 10 lançamentos e o valor, setor Funcionários, cliente que
// casa com o termo). Clica e está filtrado. Não existe menu fixo repetindo os campos
// de baixo: as opções NASCEM do que você digita.
//
// Na linha ficam só as quatro coisas de uso diário: Buscar, Loja, Situação, Período.
// Forma de pagamento, Conta, Valor e "por qual data" ficam em + Filtros, fechado.
export function BuscaFinanceiro({ params, lojaEfetiva, operaveis, formasOpc, contasOpc, setores, subcategorias, camposData, labelCampo, temFiltro }: {
  params: Record<string, string | undefined>
  lojaEfetiva: string
  operaveis: { id: string; nome: string }[]
  formasOpc: string[]
  contasOpc: { id: string; nome: string }[]
  setores: { chave: string; label: string; emoji: string; categorias: string[]; semCategoria?: boolean }[]
  subcategorias: Record<string, string[]>
  camposData: string[]
  labelCampo: Record<string, string>
  temFiltro: boolean
}) {
  const inp = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
  const [busca, setBusca] = useState(params.busca ?? '')
  const [sugestoes, setSugestoes] = useState<SugestaoBusca[]>([])
  const [sugAberto, setSugAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const caixaBusca = useRef<HTMLDivElement>(null)

  const [pessoa, setPessoa] = useState(params.pessoa ?? '')
  const [setor, setSetor] = useState(params.setor ?? '')
  const [categoria, setCategoria] = useState(params.categoria ?? '')
  const [subcategoria, setSubcategoria] = useState(params.subcategoria ?? '')
  const [forma, setForma] = useState(params.forma ?? '')
  const [conta, setConta] = useState(params.conta ?? '')
  const [status, setStatus] = useState(params.status ?? '')
  const [loja, setLoja] = useState(params.loja ?? lojaEfetiva)
  const [valorMin, setValorMin] = useState(params.valor_min ?? '')
  const [valorMax, setValorMax] = useState(params.valor_max ?? '')
  const [de, setDe] = useState(params.de ?? '')
  const [ate, setAte] = useState(params.ate ?? '')
  const [campo, setCampo] = useState(params.campo ?? 'data_vencimento')
  const [tudo, setTudo] = useState(params.tudo === '1' ? '1' : '')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const formRef = useRef<HTMLFormElement>(null)
  const enviar = () => setTimeout(() => formRef.current?.requestSubmit(), 0)
  async function token() { const { data } = await sb.auth.getSession(); return data.session?.access_token ?? '' }

  // SUGESTÃO VIVA: a cada 250 ms depois de parar de digitar, pergunta ao banco
  // quais categorias, setores e clientes casam com o termo digitado.
  useEffect(() => {
    const termo = busca.trim()
    if (termo.length < 2) { setSugestoes([]); setSugAberto(false); return }
    let vivo = true
    setCarregando(true)
    const t = setTimeout(async () => {
      try {
        const lista = await sugerirFinanceiro(await token(), termo, { loja, de, ate, campo })
        if (vivo) { setSugestoes(lista); setSugAberto(true) }
      } catch { if (vivo) setSugestoes([]) }
      finally { if (vivo) setCarregando(false) }
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca, loja, de, ate, campo])

  useEffect(() => {
    const fechar = (e: MouseEvent) => {
      if (caixaBusca.current && !caixaBusca.current.contains(e.target as Node)) setSugAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

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
        label: NOMES_MES[m] + '/' + ano,
        de: ano + '-' + String(m + 1).padStart(2, '0') + '-01',
        ate: ano + '-' + String(m + 1).padStart(2, '0') + '-' + String(ultimo).padStart(2, '0'),
      })
    }
    return lista
  }, [])
  const mesPadrao = meses[0]
  const mesAtivo = tudo === '1' ? 'tudo' : String(Math.max(0, meses.findIndex((m) => m.de === de)))

  function aplicarMes(m: { label: string; de: string; ate: string }) {
    setTudo(''); setDe(m.de); setAte(m.ate); enviar()
  }

  // Escolher uma sugestão tira o texto da busca (a etiqueta passa a ser a dona do
  // filtro) e já aplica.
  function escolher(s: SugestaoBusca) {
    setSugAberto(false)
    if (s.tipo === 'termo') { setBusca(s.valor); enviar(); return }
    setBusca('')
    if (s.tipo === 'setor') { setSetor(s.setorChave ?? ''); setCategoria(''); setSubcategoria('') }
    if (s.tipo === 'categoria') { setSetor(s.setorChave ?? ''); setCategoria(s.valor); setSubcategoria('') }
    if (s.tipo === 'subcategoria') {
      const dono = setores.find((x) => x.categorias.includes(s.categoria ?? ''))
      setSetor(dono?.chave ?? ''); setCategoria(s.categoria ?? ''); setSubcategoria(s.valor)
    }
    if (s.tipo === 'pessoa') setPessoa(s.valor)
    enviar()
  }

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
  if (params.busca) etiquetas.push({ chave: 'busca', label: 'Texto: ' + params.busca, href: semFiltro(['busca']) })
  if (params.pessoa) etiquetas.push({ chave: 'pessoa', label: params.pessoa, href: semFiltro(['pessoa']) })
  if (params.loja) {
    const nome = params.loja === 'sem' ? 'Sem loja' : params.loja === 'todas' ? 'Todas as lojas' : (operaveis.find((l) => l.id === params.loja)?.nome ?? 'Loja')
    etiquetas.push({ chave: 'loja', label: nome, href: semFiltro(['loja']) })
  }
  if (params.status) etiquetas.push({ chave: 'status', label: params.status.charAt(0).toUpperCase() + params.status.slice(1), href: semFiltro(['status']) })
  if (params.forma) etiquetas.push({ chave: 'forma', label: params.forma, href: semFiltro(['forma']) })
  if (params.conta) etiquetas.push({ chave: 'conta', label: contasOpc.find((c) => c.id === params.conta)?.nome ?? 'conta', href: semFiltro(['conta']) })
  if (params.setor) {
    const s = setores.find((x) => x.chave === params.setor)
    etiquetas.push({ chave: 'setor', label: s ? s.emoji + ' ' + s.label : params.setor, href: semFiltro(['setor', 'categoria', 'subcategoria']) })
  }
  if (params.categoria) etiquetas.push({ chave: 'categoria', label: params.categoria, href: semFiltro(['categoria', 'subcategoria']) })
  if (params.subcategoria) etiquetas.push({ chave: 'subcategoria', label: '› ' + params.subcategoria, href: semFiltro(['subcategoria']) })
  if (params.valor_min) etiquetas.push({ chave: 'valor_min', label: 'Valor ≥ ' + params.valor_min, href: semFiltro(['valor_min']) })
  if (params.valor_max) etiquetas.push({ chave: 'valor_max', label: 'Valor ≤ ' + params.valor_max, href: semFiltro(['valor_max']) })
  if (params.campo && params.campo !== 'data_vencimento') etiquetas.push({ chave: 'campo', label: 'Data: ' + (labelCampo[params.campo] ?? params.campo), href: semFiltro(['campo']) })
  const foraDoMesAtual = !!de && (de !== mesPadrao.de || ate !== mesPadrao.ate)
  if (tudo === '1') etiquetas.push({ chave: 'tudo', label: 'Histórico inteiro', href: semFiltro(['tudo', 'de', 'ate']) })
  else if (foraDoMesAtual) {
    const fmt = (d: string) => (d || '').slice(0, 10).split('-').reverse().join('/')
    etiquetas.push({ chave: 'periodo', label: fmt(de) + ' a ' + fmt(ate), href: semFiltro(['de', 'ate']) })
  }

  const ROTULO: Record<SugestaoBusca['tipo'], string> = {
    termo: 'Texto',
    setor: 'Setor',
    categoria: 'Categoria',
    subcategoria: 'Subcategoria',
    pessoa: 'Cliente / Fornecedor',
  }
  const ordemTipos: SugestaoBusca['tipo'][] = ['categoria', 'subcategoria', 'setor', 'pessoa', 'termo']
  const dinheiro = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <form ref={formRef} method="GET" className="space-y-3">
      {params.tipo && <input type="hidden" name="tipo" value={params.tipo} />}
      {tudo === '1' && <input type="hidden" name="tudo" value="1" />}
      <input type="hidden" name="setor" value={setor} />
      <input type="hidden" name="categoria" value={categoria} />
      <input type="hidden" name="subcategoria" value={subcategoria} />
      <input type="hidden" name="pessoa" value={pessoa} />
      <input type="hidden" name="de" value={de} />
      <input type="hidden" name="ate" value={ate} />

      <div className="flex flex-wrap items-end gap-2">
        <div ref={caixaBusca} className="relative min-w-[18rem] flex-1">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Buscar</label>
          <input name="busca" value={busca} onChange={(e) => setBusca(e.target.value)}
            onFocus={() => sugestoes.length > 0 && setSugAberto(true)}
            placeholder="Digite e escolha: salário, fornecedor, cliente, setor…" autoComplete="off" className={inp} />

          {sugAberto && (
            <div className="absolute z-30 mt-1 max-h-96 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
              {carregando && sugestoes.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Procurando…</p>}
              {ordemTipos.map((tipo) => {
                const doTipo = sugestoes.filter((s) => s.tipo === tipo)
                if (doTipo.length === 0) return null
                return (
                  <div key={tipo} className="py-1">
                    <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{ROTULO[tipo]}</p>
                    {doTipo.map((s, i) => (
                      <button key={tipo + i} type="button" onMouseDown={(e) => { e.preventDefault(); escolher(s) }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-blue-50">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-800">{tipo === 'termo' ? 'Buscar «' + s.valor + '»' : s.valor}</span>
                          <span className="block truncate text-[11px] text-gray-400">{s.detalhe}</span>
                        </span>
                        {s.n > 0 && (
                          <span className="shrink-0 text-right text-[11px] text-gray-500">
                            {s.n.toLocaleString('pt-BR')} lanç.
                            {s.total > 0 && <><br />{dinheiro(s.total)}</>}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )
              })}
              {!carregando && sugestoes.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Nada com esse nome. Aperte Filtrar para procurar no texto.</p>}
            </div>
          )}
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
          <select value={mesAtivo} onChange={(e) => { const v = e.target.value; if (v === 'tudo') { setTudo('1'); setDe(''); setAte(''); enviar() } else aplicarMes(meses[Number(v)]) }} className={inp}>
            {meses.map((m, i) => <option key={m.label} value={i}>{i === 0 ? m.label + ' (atual)' : m.label}</option>)}
            <option value="tudo">🗂️ Tudo (histórico)</option>
          </select>
        </div>
        <button type="button" onClick={() => setFiltrosAbertos((v) => !v)}
          className="rounded-lg border border-gray-200 px-3 py-[9px] text-sm text-gray-600 hover:bg-gray-50 transition">+ Filtros</button>
        <button type="submit" className="rounded-lg bg-blue-600 px-5 py-[9px] text-sm font-semibold text-white hover:bg-blue-700 transition">Filtrar</button>
        {temFiltro && <Link href="/painel/financeiro" className="rounded-lg border border-gray-200 px-4 py-[9px] text-sm text-gray-500 hover:bg-gray-50 transition">Limpar tudo</Link>}
      </div>

      {filtrosAbertos && (
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Forma de pagamento</label><select name="forma" value={forma} onChange={(e) => setForma(e.target.value)} className={inp}><option value="">Todas</option>{formasOpc.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Conta</label><select name="conta" value={conta} onChange={(e) => setConta(e.target.value)} className={inp}><option value="">Todas</option>{contasOpc.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Valor de</label><input name="valor_min" type="number" step="0.01" value={valorMin} onChange={(e) => setValorMin(e.target.value)} placeholder="0,00" className={inp} /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Valor até</label><input name="valor_max" type="number" step="0.01" value={valorMax} onChange={(e) => setValorMax(e.target.value)} placeholder="0,00" className={inp} /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Período conta pela data de</label><select name="campo" value={campo} onChange={(e) => setCampo(e.target.value)} className={inp}>{camposData.map((c) => <option key={c} value={c}>{labelCampo[c]}</option>)}</select></div>
        </div>
      )}

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
    </form>
  )
}
