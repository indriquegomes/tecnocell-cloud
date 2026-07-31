'use client'

import { useState } from 'react'
import Link from 'next/link'

export type MovDetalhe = {
  data: string
  vendedor: string | null
  movimentacao: string   // Venda | Reforço | Retirada | Devolução
  rotulo: string         // "Venda #508", "Reforço", ...
  forma: string          // nome da forma (Dinheiro, Crédito TON…)
  tipoForma: string      // Dinheiro | Cartão | PIX | Fiado | Crédito | Outro
  valor: number          // + entra, − sai
}

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dtBR = (s: string) => new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function FechamentoDetalhe({
  header, movimentos, voltarHref,
}: {
  header: { loja: string; operador: string; abriu: string; fechou: string | null }
  movimentos: MovDetalhe[]
  voltarHref: string
}) {
  const [vend, setVend] = useState('')
  const [mov, setMov] = useState('')
  const [pg, setPg] = useState('')

  const vendedores = [...new Set(movimentos.map((m) => m.vendedor).filter(Boolean))] as string[]
  const movTipos = [...new Set(movimentos.map((m) => m.movimentacao))]
  const pgTipos = [...new Set(movimentos.map((m) => m.tipoForma))]

  const filtrados = movimentos.filter((m) =>
    (!vend || m.vendedor === vend) && (!mov || m.movimentacao === mov) && (!pg || m.tipoForma === pg))

  const entrou = filtrados.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0)
  const saiu = filtrados.filter((m) => m.valor < 0).reduce((s, m) => s + m.valor, 0)

  // Saldo líquido por forma de pagamento (como o "Saldos no Fechamento" do SIGE). Isa 29/07.
  const porForma = Object.entries(
    filtrados.reduce<Record<string, number>>((acc, m) => { acc[m.forma] = (acc[m.forma] ?? 0) + m.valor; return acc }, {}),
  ).map(([forma, valor]) => ({ forma, valor })).sort((a, b) => b.valor - a.valor)

  const sel = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-4">
      <Link href={voltarHref} prefetch={false} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">← Voltar aos fechamentos</Link>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex-1 min-w-[220px]">
            <p className="text-base font-bold text-gray-900">🔍 Caixa {header.loja}</p>
            <p className="text-xs text-gray-500 mt-0.5">{dtBR(header.abriu)} → {header.fechou ? dtBR(header.fechou) : 'aberto'} · Operador: {header.operador}</p>
          </div>
          <select className={sel} value={vend} onChange={(e) => setVend(e.target.value)}>
            <option value="">Vendedor: todos</option>
            {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className={sel} value={mov} onChange={(e) => setMov(e.target.value)}>
            <option value="">Movimentação: todas</option>
            {movTipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={sel} value={pg} onChange={(e) => setPg(e.target.value)}>
            <option value="">Pagamento: todos</option>
            {pgTipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-gray-100 bg-gray-50/60 px-5 py-2.5 text-sm text-gray-500">
          <span>Entrou <b className="text-green-600">{money(entrou)}</b></span>
          <span>Saiu <b className="text-red-500">{money(saiu)}</b></span>
          <span>Saldo <b className="text-gray-800">{money(entrou + saiu)}</b></span>
          <span className="text-gray-400">{filtrados.length} movimento(s)</span>
        </div>

        {porForma.length > 0 && (
          <div className="border-b border-gray-100 px-5 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Saldo por forma de pagamento</p>
            <div className="flex flex-wrap gap-2">
              {porForma.map((f) => (
                <span key={f.forma} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600">
                  {f.forma}: <b className={f.valor >= 0 ? 'text-gray-800' : 'text-red-500'}>{money(f.valor)}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-2.5">Data</th><th className="px-5 py-2.5">Vendedor</th>
                <th className="px-5 py-2.5">Movimentação</th><th className="px-5 py-2.5">Pagamento</th>
                <th className="px-5 py-2.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">Nenhum movimento com esse filtro.</td></tr>
              ) : filtrados.map((m, i) => (
                <tr key={i} className="hover:bg-blue-50/50">
                  <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{dtBR(m.data)}</td>
                  <td className="px-5 py-2.5 text-gray-600">{m.vendedor ?? '—'}</td>
                  <td className="px-5 py-2.5"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{m.rotulo}</span></td>
                  <td className="px-5 py-2.5 text-gray-600">{m.forma}</td>
                  <td className={`px-5 py-2.5 text-right font-semibold tabular-nums ${m.valor >= 0 ? 'text-green-600' : 'text-red-500'}`}>{m.valor >= 0 ? '+' : '−'}{money(Math.abs(m.valor))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
