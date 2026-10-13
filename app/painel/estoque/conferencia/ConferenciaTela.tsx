'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aplicarConferencia } from './actions'

export type ItemConf = {
  id: string
  codigo: string
  gaveta: string
  nome: string
  categoria: string
  saldo: number
}

type Ordem = 'gaveta' | 'nome' | 'codigo'

export function ConferenciaTela({ itens, depositoId, depositoNome }: { itens: ItemConf[]; depositoId: string; depositoNome: string }) {
  const [ajustes, setAjustes] = useState<Record<string, number>>({})
  const [ordem, setOrdem] = useState<Ordem>('gaveta')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const ordenados = useMemo(() => {
    const arr = [...itens]
    if (ordem === 'nome') arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    else if (ordem === 'codigo') arr.sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
    return arr
  }, [itens, ordem])

  const comAjuste = itens.filter((i) => (ajustes[i.id] ?? 0) !== 0)

  function mudar(id: string, delta: number) {
    setErro(null); setSucesso(null)
    setAjustes((prev) => {
      const novo = (prev[id] ?? 0) + delta
      const next = { ...prev }
      if (novo === 0) delete next[id]
      else next[id] = novo
      return next
    })
  }

  function digitar(id: string, valor: string) {
    setErro(null); setSucesso(null)
    const limpo = valor.trim().replace(',', '.')
    const n = limpo === '' || limpo === '-' ? NaN : Math.trunc(Number(limpo))
    setAjustes((prev) => {
      const next = { ...prev }
      if (!Number.isFinite(n) || n === 0) delete next[id]
      else next[id] = n
      return next
    })
  }

  function onAplicar() {
    setErro(null); setSucesso(null)
    const negativos = comAjuste.filter((i) => i.saldo + (ajustes[i.id] ?? 0) < 0)
    if (negativos.length > 0) {
      const nomes = negativos.slice(0, 3).map((n) => n.nome).join(', ')
      setErro('Não dá pra aplicar: ' + negativos.length + ' item(ns) ficaria(m) com saldo negativo (' + nomes + (negativos.length > 3 ? '…' : '') + '). Ajuste os valores.')
      return
    }
    const mudancas = comAjuste.map((i, idx) => {
      const correcao = ajustes[i.id] ?? 0
      return { linha: idx + 1, produto_id: i.id, nome: i.nome, saldoAtual: i.saldo, correcao, novoSaldo: i.saldo + correcao }
    })
    startTransition(async () => {
      const res = await aplicarConferencia({ deposito_id: depositoId, mudancas })
      if (res.ok) {
        setSucesso(res.aplicadas)
        setAjustes({})
        router.refresh()
      } else {
        setErro(res.erro ?? 'Erro ao aplicar.')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Ordenar:</label>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="gaveta">Por gaveta</option>
            <option value="nome">Nome A–Z</option>
            <option value="codigo">Código</option>
          </select>
        </div>
        <span className="text-sm text-gray-500">{itens.length} produto(s) · {comAjuste.length} com ajuste</span>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#1B6CA8] text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Código</th>
              <th className="px-3 py-2 text-left font-semibold">Gaveta</th>
              <th className="px-3 py-2 text-left font-semibold">Produto</th>
              <th className="px-3 py-2 text-left font-semibold">Categoria</th>
              <th className="px-3 py-2 text-right font-semibold">Saldo</th>
              <th className="px-3 py-2 text-center font-semibold">Ajuste</th>
              <th className="px-3 py-2 text-right font-semibold">Depois</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ordenados.map((i) => {
              const ajuste = ajustes[i.id] ?? 0
              const depois = i.saldo + ajuste
              return (
                <tr key={i.id} className={ajuste !== 0 ? 'bg-amber-50/70' : 'bg-white'}>
                  <td className="px-3 py-1.5 tabular-nums text-gray-500">{i.codigo || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500">{i.gaveta || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-800">{i.nome}</td>
                  <td className="px-3 py-1.5 text-gray-500">{i.categoria}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium text-gray-900">{i.saldo}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button type="button" onClick={() => mudar(i.id, -1)} aria-label="Tirar 1"
                        className="h-7 w-7 rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 text-base leading-none font-bold">−</button>
                      <input
                        value={ajuste === 0 ? '' : String(ajuste)}
                        onChange={(e) => digitar(i.id, e.target.value)}
                        inputMode="numeric"
                        placeholder="0"
                        className="h-7 w-14 rounded-md border border-gray-200 px-1 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button type="button" onClick={() => mudar(i.id, 1)} aria-label="Somar 1"
                        className="h-7 w-7 rounded-md border border-green-200 bg-green-50 text-green-600 hover:bg-green-100 text-base leading-none font-bold">+</button>
                    </div>
                  </td>
                  <td className={ajuste !== 0 ? (ajuste > 0 ? 'px-3 py-1.5 text-right tabular-nums font-bold text-green-600' : 'px-3 py-1.5 text-right tabular-nums font-bold text-red-600') : 'px-3 py-1.5 text-right tabular-nums font-bold text-gray-400'}>
                    {depois}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{erro}</div>
      )}
      {sucesso !== null && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
          Pronto! {sucesso} correção(ões) aplicada(s) e registrada(s) no histórico.
        </div>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow">
        <p className="text-sm text-gray-600">
          {comAjuste.length === 0
            ? 'Marque + nas peças que sobraram e − nas que faltaram.'
            : comAjuste.length + ' item(ns) para corrigir em ' + depositoNome + '.'}
        </p>
        <div className="flex gap-2">
          {comAjuste.length > 0 && (
            <button type="button" onClick={() => setAjustes({})} disabled={pending}
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 transition disabled:opacity-50">
              Limpar
            </button>
          )}
          <button type="button" onClick={onAplicar} disabled={pending || comAjuste.length === 0}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50">
            {pending ? 'Aplicando…' : 'Aplicar ' + comAjuste.length + ' correção(ões)'}
          </button>
        </div>
      </div>
    </div>
  )
}
