'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TrocaLinha } from './page'
import { AbaterLote } from './AbaterLote'
import {
  definirFornecedor, marcarEnviada, confirmarRetorno, marcarPerdida, excluirTroca,
  lancarTrocaManual, buscarProdutosParaTroca, abaterTrocaNoFornecedor, abaterTrocasEmLote, ajustarCustoTroca,
} from './actions'

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')

const CORES: Record<string, string> = {
  aberta: 'bg-amber-100 text-amber-700',
  enviada: 'bg-blue-100 text-blue-700',
  retornou: 'bg-emerald-100 text-emerald-700',
  perdida: 'bg-rose-100 text-rose-700',
  abatida: 'bg-teal-100 text-teal-700',
  cancelada: 'bg-gray-100 text-gray-500',
}
const ROTULO: Record<string, string> = {
  aberta: 'Aberta', enviada: 'No fornecedor', retornou: 'Voltou trocada',
  perdida: 'Virou perda', abatida: 'Abatida na dívida', cancelada: 'Cancelada',
}

export function TrocasClient({
  linhas,
  fornecedores,
  depositos,
  lojas,
  dividas,
  temAbatimento,
  erro,
}: {
  linhas: TrocaLinha[]
  fornecedores: { id: string; nome: string }[]
  depositos: { id: string; nome: string }[]
  lojas: { id: string; nome: string }[]
  dividas: { fornecedor: string; valor: number }[]
  temAbatimento: boolean
  erro?: string
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [msg, setMsg] = useState<string | null>(erro ?? null)
  const [filtro, setFiltro] = useState<'todas' | 'aberta' | 'enviada' | 'retornou' | 'abatida' | 'perdida'>('todas')
  const [lojaFiltro, setLojaFiltro] = useState<string>('todas')
  const [fornFiltro, setFornFiltro] = useState<string>('todos')
  const [abatendo, setAbatendo] = useState<TrocaLinha | null>(null)
  const [lote, setLote] = useState(false)

  const visiveis = linhas.filter((l) => {
    if (filtro !== 'todas' && l.status !== filtro) return false
    if (lojaFiltro !== 'todas' && (l.loja ?? '—') !== lojaFiltro) return false
    if (fornFiltro === 'sem' && l.fornecedor_id) return false
    if (fornFiltro !== 'todos' && fornFiltro !== 'sem' && l.fornecedor_id !== fornFiltro) return false
    return true
  })

  function rodar(fn: () => Promise<unknown>) {
    iniciar(async () => {
      setMsg(null)
      const r = await fn().catch((e: unknown) => ({ ok: false, erro: e instanceof Error ? e.message : 'erro' }))
      const res = r as { ok?: boolean; erro?: string } | undefined
      if (res && res.ok === false && res.erro) setMsg(res.erro)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {msg && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>}

      {/* Situação */}
      <div className="flex flex-wrap items-center gap-2">
        {(['todas', 'aberta', 'enviada', 'retornou', 'abatida', 'perdida'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filtro === f ? 'bg-[#1B6CA8] text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {f === 'todas' ? 'Todas' : ROTULO[f]} ({f === 'todas' ? linhas.length : linhas.filter((l) => l.status === f).length})
          </button>
        ))}
      </div>

      {/* Loja + fornecedor */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase text-gray-400">Loja</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setLojaFiltro('todas')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${lojaFiltro === 'todas' ? 'bg-gray-800 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              As duas ({linhas.length})
            </button>
            {lojas.map((loja) => {
              const n = linhas.filter((l) => l.loja === loja.nome).length
              return (
                <button
                  key={loja.id}
                  onClick={() => setLojaFiltro(loja.nome)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${lojaFiltro === loja.nome ? 'bg-gray-800 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {loja.nome} ({n})
                </button>
              )
            })}
          </div>
        </div>
        <label className="min-w-[240px] flex-1 text-xs text-gray-500">
          <span className="mb-1 block font-semibold uppercase text-gray-400">Fornecedor</span>
          <select value={fornFiltro} onChange={(e) => setFornFiltro(e.target.value)} className="field text-xs">
            <option value="todos">Todos os fornecedores</option>
            <option value="sem">— Sem fornecedor definido —</option>
            {fornecedores.map((f) => {
              const n = linhas.filter((l) => l.fornecedor_id === f.id).length
              return <option key={f.id} value={f.id}>{f.nome}{n ? ` (${n})` : ''}</option>
            })}
          </select>
        </label>
        <p className="pb-1 text-xs text-gray-500">
          Mostrando <b className="text-gray-800">{visiveis.length}</b> de {linhas.length}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2">Saiu em</th>
              <th className="px-3 py-2">Peça</th>
              <th className="px-3 py-2 text-center">Qtd</th>
              <th className="px-3 py-2 text-right">Custo</th>
              <th className="px-3 py-2">Loja</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2 text-center">Dias</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visiveis.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-gray-400">Nenhuma troca com esse filtro.</td></tr>
            ) : visiveis.map((l) => (
              <tr key={l.id} className="hover:bg-blue-50/40 transition">
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{dataBR(l.data_saida)}</td>
                <td className="px-3 py-2">
                  <p className="font-medium text-gray-800">{l.produto_nome ?? l.produto_id}</p>
                  {l.produto_retorno_nome && l.produto_retorno_nome !== l.produto_nome && (
                    <p className="text-[11px] text-emerald-700">voltou: {l.produto_retorno_nome}</p>
                  )}
                  {l.pessoa_nome && <p className="text-[11px] text-gray-400">cliente: {l.pessoa_nome}</p>}
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{l.quantidade}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt(l.custo)}
                  {(l.status === 'aberta' || l.status === 'enviada') && (
                    <button
                      disabled={pendente}
                      onClick={() => {
                        const atual = String(l.custo).replace('.', ',')
                        const digitado = window.prompt(
                          `Custo da peça "${l.produto_nome ?? l.produto_id}"\n\n` +
                          `Hoje no app: R$ ${atual}\n\n` +
                          'Digite o custo que o fornecedor está usando (o da última conta).',
                          atual,
                        )
                        if (digitado == null) return
                        // Padrão = só esta troca: não reavalia estoque nem CMV.
                        const tambemCadastro = window.confirm(
                          'Ajustar TAMBÉM o cadastro do produto?\n\n' +
                          'OK  = cadastro também (muda a avaliação do estoque e o CMV das próximas vendas)\n' +
                          'Cancelar = SOMENTE esta troca (não mexe em estoque nem CMV)',
                        )
                        const fd = new FormData()
                        fd.set('id', l.id)
                        fd.set('custo', digitado)
                        if (tambemCadastro) fd.set('no_cadastro', '1')
                        rodar(() => ajustarCustoTroca(fd).then((r) => {
                          setMsg(r.ok
                            ? `Custo ajustado: R$ ${fmt(r.de ?? 0)} → R$ ${fmt(r.para ?? 0)} · ${r.cadastro ? 'troca e cadastro do produto' : 'somente esta troca'}`
                            : (r.erro ?? 'Não deu pra ajustar.'))
                          return r
                        }))
                      }}
                      className="ml-1.5 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 hover:bg-gray-50"
                      title="Ajustar o custo desta peça para o valor que o fornecedor usa"
                    >
                      ajustar
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">{l.loja ?? '—'}</td>
                <td className="px-3 py-2">
                  {l.status === 'retornou' || l.status === 'perdida' ? (
                    <span className="text-gray-600">{l.fornecedor_nome ?? '—'}</span>
                  ) : (
                    <select
                      defaultValue={l.fornecedor_id ?? ''}
                      disabled={pendente}
                      onChange={(e) => rodar(() => { const fd = new FormData(); fd.set('id', l.id); fd.set('fornecedor_id', e.target.value); return definirFornecedor(fd) })}
                      className="rounded-lg border border-gray-200 px-1.5 py-1 text-xs text-gray-700"
                    >
                      <option value="">— escolher —</option>
                      {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2 text-center tabular-nums text-gray-600">{l.dias}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CORES[l.status] ?? 'bg-gray-100 text-gray-600'}`}>{ROTULO[l.status] ?? l.status}</span>
                  {l.valor_abatido ? <p className="mt-0.5 text-[11px] text-teal-700">abatido {fmt(l.valor_abatido)}</p> : null}
                  {l.perda ? <p className="mt-0.5 text-[11px] text-rose-600">perda {fmt(l.perda)}</p> : null}
                  {l.observacao && <p className="mt-0.5 text-[11px] text-gray-400">{l.observacao}</p>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {l.status === 'aberta' && (
                      <button
                        disabled={pendente}
                        onClick={() => rodar(() => { const fd = new FormData(); fd.set('id', l.id); return marcarEnviada(fd) })}
                        className="rounded border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        Enviei
                      </button>
                    )}
                    {(l.status === 'aberta' || l.status === 'enviada') && (
                      <>
                        <button
                          disabled={pendente || !temAbatimento}
                          onClick={() => setAbatendo(l)}
                          className="rounded bg-teal-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
                          title={temAbatimento ? 'O fornecedor não devolveu a peça: deu crédito na dívida' : 'Falta rodar a migration do abatimento'}
                        >
                          Abatido na nota
                        </button>
                        <button
                          disabled={pendente}
                          onClick={() => rodar(() => { const fd = new FormData(); fd.set('id', l.id); return confirmarRetorno(fd) })}
                          className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          title="O fornecedor trocou: entra no estoque DA LOJA de onde saiu (mesma peça ou substituta)"
                        >
                          ✓ Voltou trocada
                        </button>
                        <button
                          disabled={pendente}
                          onClick={() => rodar(() => { const fd = new FormData(); fd.set('id', l.id); return marcarPerdida(fd) })}
                          className="rounded border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                          title="O fornecedor não trocou: a peça vira perda do mês (não entra no estoque)"
                        >
                          Virou perda
                        </button>
                      </>
                    )}
                    {l.status !== 'retornou' && (
                      <button
                        disabled={pendente}
                        onClick={() => {
                          if (!confirm('Excluir esta troca?\n\nA peça volta para o estoque de onde saiu (o lançamento foi feito por engano).')) return
                          rodar(() => { const fd = new FormData(); fd.set('id', l.id); return excluirTroca(fd) })
                        }}
                        className="rounded border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lote && (
        <AbaterLote
          linhas={linhas}
          fornecedores={fornecedores}
          dividas={dividas}
          pendente={pendente}
          fechar={() => setLote(false)}
          rodar={rodar}
        />
      )}

      {abatendo && (
        <AbaterNaNota
          troca={abatendo}
          fornecedores={fornecedores}
          dividas={dividas}
          pendente={pendente}
          fechar={() => setAbatendo(null)}
          rodar={rodar}
        />
      )}

      <NovaTroca depositos={depositos} pendente={pendente} rodar={rodar} setMsg={setMsg} />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setLote(true)}
          disabled={!temAbatimento}
          title={temAbatimento ? 'Fornecedor abateu um valor único em várias peças' : 'Falta rodar a migration do abatimento'}
          className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-40 transition"
        >
          Abatimento em grupo
        </button>
      </div>

      <p className="text-[11px] leading-snug text-gray-400">
        A peça sai do estoque como movimento de <b>troca</b> e não volta sozinha. O check de retorno dá entrada no
        <b> PETRÓPOLIS ESTOQUE</b> — nunca no LOJA. Peça substituta mais barata gera a perda da diferença.
      </p>
    </div>
  )
}

function AbaterNaNota({
  troca,
  fornecedores,
  dividas,
  pendente,
  fechar,
  rodar,
}: {
  troca: TrocaLinha
  fornecedores: { id: string; nome: string }[]
  dividas: { fornecedor: string; valor: number }[]
  pendente: boolean
  fechar: () => void
  rodar: (fn: () => Promise<unknown>) => void
}) {
  const [valor, setValor] = useState('')
  const [fornecedorId, setFornecedorId] = useState(troca.fornecedor_id ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const custoTotal = Math.round(troca.custo * troca.quantidade * 100) / 100
  const digitado = Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100) / 100
  const perdaPrevista = digitado > 0 ? Math.max(0, Math.round((custoTotal - digitado) * 100) / 100) : 0
  const nomeFornecedor = fornecedores.find((f) => f.id === fornecedorId)?.nome ?? null
  const dividaAberta = nomeFornecedor ? (dividas.find((d) => d.fornecedor === nomeFornecedor)?.valor ?? 0) : 0
  const sobra = digitado > 0 && digitado > dividaAberta ? Math.round((digitado - dividaAberta) * 100) / 100 : 0

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 shadow-sm space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-800">Abatido na nota — {troca.produto_nome ?? 'peça'}</p>
        <p className="text-[11px] text-gray-500">O fornecedor não devolveu a peça e deu crédito na dívida. Isso <b>não é perda</b>: o valor compra outras peças.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-gray-500">
          Fornecedor que abateu
          <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="field mt-1 text-xs">
            <option value="">— escolher —</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Valor abatido (R$)
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="ex: 910,00" className="field mt-1 text-xs" />
        </label>
        <div className="rounded-lg bg-white px-3 py-2 text-[11px] text-gray-600">
          <p>Custo da peça: <b>{fmt(custoTotal)}</b></p>
          <p>Dívida aberta do fornecedor: <b>{fmt(dividaAberta)}</b></p>
          <p className={perdaPrevista > 0 ? 'text-rose-600' : 'text-emerald-700'}>
            {digitado > 0 ? (perdaPrevista > 0 ? `Vai registrar perda de ${fmt(perdaPrevista)}` : 'Sem perda') : '—'}
          </p>
          {sobra > 0 && <p className="text-amber-700">{fmt(sobra)} viram crédito com o fornecedor</p>}
        </div>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>}

      <div className="flex gap-2">
        <button
          disabled={pendente}
          onClick={() => {
            if (!fornecedorId) { setErro('Escolha o fornecedor que deu o abatimento.'); return }
            if (!(digitado > 0)) { setErro('Digite o valor que ele abateu.'); return }
            setErro(null)
            const fd = new FormData()
            fd.set('id', troca.id)
            fd.set('valor', valor)
            fd.set('fornecedor_id', fornecedorId)
            rodar(() => abaterTrocaNoFornecedor(fd).then((r) => {
              if (r.ok) fechar()
              else setErro(r.erro ?? 'Não deu pra abater.')
              return r
            }))
          }}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          Abater na dívida
        </button>
        <button onClick={fechar} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-white">Cancelar</button>
      </div>
    </div>
  )
}

function NovaTroca({
  depositos,
  pendente,
  rodar,
  setMsg,
}: {
  depositos: { id: string; nome: string }[]
  pendente: boolean
  rodar: (fn: () => Promise<unknown>) => void
  setMsg: (m: string | null) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<{ id: string; nome: string }[]>([])
  const [buscando, setBuscando] = useState(false)
  const [buscou, setBuscou] = useState(false)
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(null)
  const [qtd, setQtd] = useState('1')
  const [dep, setDep] = useState('')
  const [motivo, setMotivo] = useState('')
  const [tirar, setTirar] = useState(true)
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
        + Lançar troca na mão
      </button>
    )
  }

  async function buscar() {
    const t = termo.trim()
    if (t.length < 2) { setErroLocal('Digite pelo menos 2 letras do nome (ou o código) da peça.'); return }
    setBuscando(true); setErroLocal(null); setEscolhido(null)
    try {
      const lista = await buscarProdutosParaTroca(t)
      setResultados(lista)
      setBuscou(true)
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : 'Erro ao buscar a peça.')
    } finally { setBuscando(false) }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
      <p className="text-sm font-semibold text-gray-700">Lançar troca na mão</p>

      {/* Busca por nome/código — antes pedia o ID do produto e não achava nada */}
      <div>
        <p className="text-xs text-gray-500">Qual é a peça?</p>
        <div className="mt-1 flex gap-2">
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar() } }}
            placeholder="ex: frontal samsung a15"
            className="field flex-1 text-sm"
          />
          <button onClick={() => void buscar()} disabled={buscando} className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50">
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {escolhido && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Peça escolhida: <b>{escolhido.nome}</b>
          </p>
        )}
        {!escolhido && buscou && resultados.length === 0 && (
          <p className="mt-2 text-xs text-amber-700">Nenhuma peça encontrada com esse nome. Tente outra palavra.</p>
        )}
        {!escolhido && resultados.length > 0 && (
          <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-gray-200">
            {resultados.map((r) => (
              <button
                key={r.id}
                onClick={() => { setEscolhido(r); setResultados([]) }}
                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs text-gray-700 last:border-0 hover:bg-blue-50"
              >
                {r.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-gray-500">
          Quantidade
          <input value={qtd} onChange={(e) => setQtd(e.target.value)} inputMode="numeric" className="field mt-1 text-xs" />
        </label>
        <label className="text-xs text-gray-500">
          Saiu do depósito
          <select value={dep} onChange={(e) => setDep(e.target.value)} className="field mt-1 text-xs">
            <option value="">— escolher —</option>
            {depositos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Motivo
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex: defeito no frontal" className="field mt-1 text-xs" />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={tirar} onChange={(e) => setTirar(e.target.checked)} />
        Já tirar do estoque agora
      </label>

      {erroLocal && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erroLocal}</p>}

      <div className="flex gap-2">
        <button
          disabled={pendente || !escolhido}
          onClick={() => {
            if (!escolhido) { setErroLocal('Busque e escolha a peça antes de salvar.'); return }
            if (tirar && !dep) { setErroLocal('Escolha de qual depósito a peça saiu.'); return }
            setErroLocal(null)
            const fd = new FormData()
            fd.set('produto_id', escolhido.id)
            fd.set('quantidade', qtd)
            fd.set('deposito_saida_id', dep)
            fd.set('motivo', motivo)
            if (tirar) fd.set('tirar_do_estoque', '1')
            rodar(() => lancarTrocaManual(fd).then((r) => {
              if (r.ok) { setAberto(false); setMsg(`Troca lançada: ${escolhido.nome}.`) }
              else setMsg(r.erro ?? 'Não deu pra lançar a troca.')
              return r
            }))
          }}
          className="rounded-lg bg-[#1B6CA8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#155a8a] disabled:opacity-50"
        >
          Salvar
        </button>
        <button onClick={() => setAberto(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
      </div>
    </div>
  )
}
