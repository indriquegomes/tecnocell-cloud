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
// Em + Filtros ficam as perguntas que a barra de cima não responde: faixa de valor,
// forma de pagamento, datas personalizadas, de onde o lançamento veio (venda / fiado /
// digitado à mão), o que vence nos próximos dias e o agrupamento com total.
// Saíram daqui "Conta" e "por qual data" — eram ruído de contador.
export function BuscaFinanceiro({ params, lojaEfetiva, operaveis, formasOpc, setores, subcategorias, temFiltro }: {
  params: Record<string, string | undefined>
  lojaEfetiva: string
  operaveis: { id: string; nome: string }[]
  formasOpc: string[]
  setores: { chave: string; label: string; emoji: string; categorias: string[]; semCategoria?: boolean }[]
  subcategorias: Record<string, string[]>
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
  const [origem, setOrigem] = useState(params.origem ?? '')
  const [vence, setVence] = useState(params.vence ?? '')
  const [agrupar, setAgrupar] = useState(params.agrupar ?? '')
  const [status, setStatus] = useState(params.status ?? '')
  const [loja, setLoja] = useState(params.loja ?? lojaEfetiva)
  const [valorMin, setValorMin] = useState(params.valor_min ?? '')
  const [valorMax, setValorMax] = useState(params.valor_max ?? '')
  const [de, setDe] = useState(params.de ?? '')
  const [ate, setAte] = useState(params.ate ?? '')
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
        const lista = await sugerirFinanceiro(await token(), termo, { loja, de, ate })
        if (vivo) { setSugestoes(lista); setSugAberto(true) }
      } catch { if (vivo) setSugestoes([]) }
      finally { if (vivo) setCarregando(false) }
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca, loja, de, ate])

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
  if (params.setor) {
    const s = setores.find((x) => x.chave === params.setor)
    etiquetas.push({ chave: 'setor', label: s ? s.emoji + ' ' + s.label : params.setor, href: semFiltro(['setor', 'categoria', 'subcategoria']) })
  }
  // Categoria, subcategoria e setor são aplicados juntos (a cascata escolhe os três de
  // uma vez). Por isso fechar qualquer um deles volta ao estado ANTERIOR à escolha:
  // descarta o grupo inteiro, em vez de deixar o setor filtrando sozinho e a tela
  // parecendo que não mudou nada.
  const GRUPO_CLASSIFICACAO = ['setor', 'categoria', 'subcategoria']
  if (params.categoria) etiquetas.push({ chave: 'categoria', label: params.categoria, href: semFiltro(GRUPO_CLASSIFICACAO) })
  if (params.subcategoria) etiquetas.push({ chave: 'subcategoria', label: '› ' + params.subcategoria, href: semFiltro(GRUPO_CLASSIFICACAO) })
  if (params.valor_min) etiquetas.push({ chave: 'valor_min', label: 'Valor ≥ ' + params.valor_min, href: semFiltro(['valor_min']) })
  if (params.valor_max) etiquetas.push({ chave: 'valor_max', label: 'Valor ≤ ' + params.valor_max, href: semFiltro(['valor_max']) })
  if (params.origem) {
    const rotulo = params.origem === 'venda' ? 'Veio de venda' : params.origem === 'fiado' ? 'Veio de fiado' : 'Digitado à mão'
    etiquetas.push({ chave: 'origem', label: rotulo, href: semFiltro(['origem']) })
  }
  if (params.vence) {
    const rotulo = params.vence === 'hoje' ? 'Vence hoje' : params.vence === '7dias' ? 'Vence em até 7 dias' : 'Vence neste mês'
    etiquetas.push({ chave: 'vence', label: rotulo, href: semFiltro(['vence']) })
  }
  if (params.agrupar) {
    const rotulo = params.agrupar === 'categoria' ? 'Total por categoria' : params.agrupar === 'loja' ? 'Total por loja' : 'Total por pessoa'
    etiquetas.push({ chave: 'agrupar', label: rotulo, href: semFiltro(['agrupar']) })
  }
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
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Valor de</label><input name="valor_min" type="number" step="0.01" value={valorMin} onChange={(e) => setValorMin(e.target.value)} placeholder="0,00" className={inp} /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Valor até</label><input name="valor_max" type="number" step="0.01" value={valorMax} onChange={(e) => setValorMax(e.target.value)} placeholder="0,00" className={inp} /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Forma de pagamento</label><select name="forma" value={forma} onChange={(e) => setForma(e.target.value)} className={inp}><option value="">Todas</option>{formasOpc.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">De onde veio</label>
            <select name="origem" value={origem} onChange={(e) => setOrigem(e.target.value)} className={inp}>
              <option value="">Qualquer origem</option>
              <option value="venda">Veio de uma venda</option>
              <option value="fiado">Veio de fiado</option>
              <option value="manual">Digitado à mão</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Vence em</label>
            <select name="vence" value={vence} onChange={(e) => setVence(e.target.value)} className={inp}>
              <option value="">Qualquer data</option>
              <option value="hoje">Hoje</option>
              <option value="7dias">Até 7 dias</option>
              <option value="mes">Neste mês</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Período personalizado</label>
            <div className="flex items-center gap-1">
              <input name="de" type="date" value={de} onChange={(e) => { setDe(e.target.value); setTudo('') }} className={inp} />
              <span className="text-xs text-gray-400">até</span>
              <input name="ate" type="date" value={ate} onChange={(e) => { setAte(e.target.value); setTudo('') }} className={inp} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Agrupar e totalizar</label>
            <select name="agrupar" value={agrupar} onChange={(e) => setAgrupar(e.target.value)} className={inp}>
              <option value="">Listar linha por linha</option>
              <option value="categoria">Total por categoria</option>
              <option value="loja">Total por loja</option>
              <option value="pessoa">Total por pessoa</option>
            </select>
          </div>
          <div className="flex items-end">
            <p className="text-[11px] leading-tight text-gray-400">Agrupado, a tela deixa de listar e passa a somar: quanto cada categoria, loja ou pessoa pesa no filtro.</p>
          </div>
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
