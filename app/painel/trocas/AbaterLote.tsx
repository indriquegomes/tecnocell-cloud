'use client'

import { useState } from 'react'
import { abaterTrocasEmLote } from './actions'

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Linha = {
  id: string
  produto_id: string
  produto_nome: string | null
  quantidade: number
  custo: number
  loja: string | null
  fornecedor_id: string | null
  data_saida: string
}

/**
 * ABATIMENTO EM GRUPO — o fornecedor abateu um valor único na dívida.
 *
 * Regra do dono (04/11): quem manda é o VALOR. A peça é consequência. No modo
 * automático (padrão) o app fecha sozinho as peças MAIS ANTIGAS daquele
 * fornecedor até o custo delas caber no valor abatido — o dono não escolhe
 * quantidade. Quem quiser controle fino liga o modo manual e marca peça por peça.
 */
export function AbaterLote({
  linhas,
  fornecedores,
  dividas,
  pendente,
  fechar,
  rodar,
}: {
  linhas: Linha[]
  fornecedores: { id: string; nome: string }[]
  dividas: { fornecedor: string; valor: number }[]
  pendente: boolean
  fechar: () => void
  rodar: (fn: () => Promise<unknown>) => void
}) {
  const abertas = linhas.filter((l) => (l as { status?: string }).status === 'aberta' || (l as { status?: string }).status === 'enviada')
  const [fornecedorId, setFornecedorId] = useState('')
  const [valor, setValor] = useState('')
  const [modo, setModo] = useState<'auto' | 'manual'>('auto')
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const digitado = Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100) / 100
  const nomeFornecedor = fornecedores.find((f) => f.id === fornecedorId)?.nome ?? null
  const dividaAberta = nomeFornecedor ? (dividas.find((d) => d.fornecedor === nomeFornecedor)?.valor ?? 0) : 0

  // PREVISÃO do modo automático: peças mais antigas do fornecedor que caibam no valor
  const candidatas = abertas
    .filter((l) => l.fornecedor_id === fornecedorId)
    .slice()
    .sort((a, b) => String(a.data_saida).localeCompare(String(b.data_saida)))
  const automaticas: Linha[] = []
  let acc = 0
  for (const l of candidatas) {
    const c = Math.round(l.custo * l.quantidade * 100) / 100
    if (c <= 0) continue
    if (Math.round((acc + c) * 100) / 100 > digitado + 0.005) continue
    automaticas.push(l)
    acc = Math.round((acc + c) * 100) / 100
  }

  const escolhidas = modo === 'auto' ? automaticas : abertas.filter((l) => marcadas.has(l.id))
  const custoTotal = Math.round(escolhidas.reduce((s, l) => s + l.custo * l.quantidade, 0) * 100) / 100
  const perdaPrevista = digitado > 0 ? Math.max(0, Math.round((custoTotal - digitado) * 100) / 100) : 0
  const sobra = digitado > 0 && digitado > dividaAberta ? Math.round((digitado - dividaAberta) * 100) / 100 : 0
  const filtradas = abertas.filter((l) => !busca.trim() || (l.produto_nome ?? '').toLowerCase().includes(busca.trim().toLowerCase()))

  const alternar = (id: string) => setMarcadas((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 shadow-sm space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-800">Abatimento em grupo</p>
        <p className="text-[11px] text-gray-500">
          O fornecedor abateu <b>um valor único</b> na dívida. Você digita o valor; as peças são consequência.
        </p>
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
          Valor total abatido (R$)
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="ex: 910,00" className="field mt-1 text-xs" />
        </label>
        <div className="rounded-lg bg-white px-3 py-2 text-[11px] text-gray-600">
          <p>Vai fechar: <b>{escolhidas.length} peça(s)</b> · custo <b>{fmt(custoTotal)}</b></p>
          <p>Dívida aberta do fornecedor: <b>{fmt(dividaAberta)}</b></p>
          <p className={perdaPrevista > 0 ? 'text-rose-600' : 'text-emerald-700'}>
            {digitado > 0 ? (perdaPrevista > 0 ? `Vai registrar perda de ${fmt(perdaPrevista)}` : 'Sem perda') : '—'}
          </p>
          {sobra > 0 && <p className="text-amber-700">{fmt(sobra)} viram crédito com o fornecedor</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={modo === 'auto'} onChange={() => setModo('auto')} />
          Automático — as peças mais antigas até consumir o valor
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={modo === 'manual'} onChange={() => setModo('manual')} />
          Escolher as peças na mão
        </label>
      </div>

      {modo === 'auto' ? (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600">
          {!fornecedorId || digitado <= 0
            ? 'Escolha o fornecedor e digite o valor para ver quais peças vão fechar.'
            : automaticas.length === 0
              ? 'Nenhuma peça em aberto desse fornecedor cabe nesse valor. Use o modo manual.'
              : automaticas.map((l) => (
                  <p key={l.id} className="truncate">
                    • {l.produto_nome ?? l.produto_id} <span className="text-gray-400">({l.loja ?? '—'})</span> — {fmt(l.custo * l.quantidade)}
                  </p>
                ))}
        </div>
      ) : (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="filtrar peça…" className="field text-xs" />
            <button onClick={() => setMarcadas(new Set(filtradas.map((l) => l.id)))} className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              Marcar todas ({filtradas.length})
            </button>
            <button onClick={() => setMarcadas(new Set())} className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
              Limpar
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white">
            {filtradas.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-gray-400">Nenhuma peça em aberto.</p>
            ) : filtradas.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2 border-b border-gray-50 px-3 py-1.5 text-xs last:border-0 hover:bg-teal-50/40">
                <input type="checkbox" checked={marcadas.has(l.id)} onChange={() => alternar(l.id)} className="h-3.5 w-3.5" />
                <span className="flex-1 truncate text-gray-700">{l.produto_nome ?? l.produto_id}</span>
                <span className="text-gray-400">{l.loja ?? '—'}</span>
                <span className="w-16 text-right tabular-nums text-gray-600">{fmt(l.custo * l.quantidade)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>}

      <div className="flex gap-2">
        <button
          disabled={pendente}
          onClick={() => {
            if (!fornecedorId) { setErro('Escolha o fornecedor que deu o abatimento.'); return }
            if (!(digitado > 0)) { setErro('Digite o valor total que ele abateu.'); return }
            if (modo === 'manual' && !escolhidas.length) { setErro('Marque as peças que serão fechadas.'); return }
            setErro(null)
            const fd = new FormData()
            fd.set('valor', valor)
            fd.set('fornecedor_id', fornecedorId)
            if (modo === 'manual' && escolhidas.length) fd.set('ids', escolhidas.map((l) => l.id).join(','))
            rodar(() => abaterTrocasEmLote(fd).then((r) => {
              if (r.ok) fechar()
              else setErro(r.erro ?? 'Não deu pra abater.')
              return r
            }))
          }}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {digitado > 0 ? `Abater R$ ${fmt(digitado)}` : 'Abater na dívida'}
        </button>
        <button onClick={fechar} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-white">Cancelar</button>
      </div>
    </div>
  )
}
