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
  header: { loja: string; operador: string; abriu: string; fechou: string | null; valorAbertura: number; valorFechamento: number; obsAbertura: string | null }
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

  // Resumo por tipo de operação (blocos do PDF do SIGE: vendas / recebimentos /
  // reforços / devoluções / retiradas). Isa 29/07 — espelhar o fechamento do SIGE.
  const ordemOp = ['Venda', 'Recebimento', 'Reforço', 'Devolução', 'Retirada']
  const porOperacao = Object.entries(
    filtrados.reduce<Record<string, { qtd: number; total: number }>>((acc, m) => {
      ;(acc[m.movimentacao] ??= { qtd: 0, total: 0 }); acc[m.movimentacao].qtd++; acc[m.movimentacao].total += m.valor; return acc
    }, {}),
  ).map(([tipo, r]) => ({ tipo, ...r }))
    .sort((a, b) => ((ordemOp.indexOf(a.tipo) + 1) || 99) - ((ordemOp.indexOf(b.tipo) + 1) || 99))

  const sel = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500'

  // 🖨️ Demonstrativo de Fechamento de Caixa — documento A4 espelhando o PDF do SIGE.
  // Seções por tipo de operação (vendas por forma, recebimentos, reforços, retiradas,
  // devoluções) com SALDO CORRENDO a partir do valor de abertura, + saldos por forma.
  const imprimirDemonstrativo = () => {
    const dtFull = (s: string) => new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    let saldo = header.valorAbertura
    const rowVenda = (m: MovDetalhe) => { saldo += m.valor; return `<tr><td>${m.rotulo}</td><td>${dtFull(m.data)}</td><td>${m.forma}</td><td class="r">${money(m.valor)}</td><td class="r">${money(saldo)}</td></tr>` }
    const rowMot = (m: MovDetalhe) => { saldo += m.valor; return `<tr><td>${dtFull(m.data)}</td><td>${m.forma}</td><td>${m.rotulo}</td><td class="r">${money(m.valor)}</td><td class="r">${money(saldo)}</td></tr>` }
    const secaoVenda = (titulo: string, rows: MovDetalhe[]) => rows.length ? `<h3>${titulo}</h3><table><thead><tr><th>Código</th><th>Data</th><th>Forma</th><th class="r">Valor</th><th class="r">Saldo</th></tr></thead><tbody>${rows.sort((a, b) => a.data.localeCompare(b.data)).map(rowVenda).join('')}</tbody></table>` : ''
    const secaoMot = (titulo: string, rows: MovDetalhe[]) => rows.length ? `<h3>${titulo}</h3><table><thead><tr><th>Data</th><th>Forma</th><th>Motivo</th><th class="r">Valor</th><th class="r">Saldo</th></tr></thead><tbody>${rows.sort((a, b) => a.data.localeCompare(b.data)).map(rowMot).join('')}</tbody></table>` : ''

    const vendas = movimentos.filter((m) => m.movimentacao === 'Venda')
    const formasVenda = [...new Set(vendas.map((m) => m.forma))]
    let corpo = ''
    for (const f of formasVenda) corpo += secaoVenda(`Vendas Realizadas no PDV - ${f}`, vendas.filter((m) => m.forma === f))
    corpo += secaoVenda('Pagamentos no Crediário', movimentos.filter((m) => m.movimentacao === 'Recebimento'))
    corpo += secaoMot('Reforços no Caixa', movimentos.filter((m) => m.movimentacao === 'Reforço'))
    corpo += secaoMot('Retiradas Realizadas no Caixa', movimentos.filter((m) => m.movimentacao === 'Retirada'))
    corpo += secaoVenda('Devoluções Realizadas no Caixa', movimentos.filter((m) => m.movimentacao === 'Devolução'))

    const porFormaTodos = Object.entries(movimentos.reduce<Record<string, number>>((a, m) => { a[m.forma] = (a[m.forma] ?? 0) + m.valor; return a }, {})).sort((a, b) => b[1] - a[1])
    const saldosFech = `<h3>Saldos no Fechamento do Caixa</h3><table><thead><tr><th>Forma Pagamento</th><th class="r">Saldo</th></tr></thead><tbody>${porFormaTodos.map(([f, v]) => `<tr><td>${f}</td><td class="r">${money(v)}</td></tr>`).join('')}</tbody></table>`

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Demonstrativo de Fechamento — ${header.loja}</title><style>
      @page { size: A4; margin: 14mm; }
      body { font-family: 'Times New Roman', serif; font-size: 11px; color: #000; }
      h1 { text-align: center; font-size: 17px; margin: 0 0 4px; }
      .sub { text-align: center; font-weight: bold; margin: 2px 0; }
      .box { text-align: center; font-weight: bold; margin: 10px 0; font-size: 11px; }
      h3 { font-size: 12px; margin: 16px 0 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th, td { border: 1px dashed #999; padding: 3px 5px; text-align: left; vertical-align: top; }
      th { font-weight: bold; }
      .r { text-align: right; white-space: nowrap; }
      .foot { text-align: center; font-weight: bold; margin-top: 14px; }
      @media print { button { display: none; } }
    </style></head><body>
      <h1>Demonstrativo de Fechamento de Caixa</h1>
      <p class="sub">${header.loja}</p>
      <p class="box">Caixa aberto em ${dtFull(header.abriu)} com o valor de ${money(header.valorAbertura)}${header.obsAbertura ? ` pelo usuário: ${header.obsAbertura}` : header.operador !== '—' ? ` pelo usuário: ${header.operador}` : ''}</p>
      <h3>Saldo na Abertura do Caixa</h3>
      <table><thead><tr><th>Forma Pagamento</th><th class="r">Saldo</th></tr></thead><tbody><tr><td>Dinheiro</td><td class="r">${money(header.valorAbertura)}</td></tr></tbody></table>
      ${corpo}
      ${saldosFech}
      <p class="foot">Caixa ${header.fechou ? `fechado em ${dtFull(header.fechou)}` : 'ainda ABERTO'} com o valor de ${money(saldo)}</p>
      <p style="text-align:center;margin-top:6px;font-size:10px;">TecnoCell Cloud PDV</p>
    </body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html); w.document.close()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div className="space-y-4">
      <Link href={voltarHref} prefetch={false} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">← Voltar aos fechamentos</Link>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex-1 min-w-[220px]">
            <p className="text-base font-bold text-gray-900">🔍 Caixa {header.loja}</p>
            <p className="text-xs text-gray-500 mt-0.5">{dtBR(header.abriu)} → {header.fechou ? dtBR(header.fechou) : 'aberto'} · Operador: {header.operador}</p>
          </div>
          <button onClick={imprimirDemonstrativo} title="Documento A4 no formato do SIGE"
            className="rounded-lg bg-[#1B6CA8] px-3 py-2 text-sm font-semibold text-white hover:bg-[#155a8a] transition">
            🖨️ Imprimir Demonstrativo
          </button>
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

        {porOperacao.length > 0 && (
          <div className="border-b border-gray-100 px-5 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Resumo por tipo de operação</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {porOperacao.map((o) => (
                <div key={o.tipo} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
                  <p className="text-xs font-medium text-gray-500">{o.tipo} · {o.qtd}</p>
                  <p className={`text-sm font-bold tabular-nums ${o.total >= 0 ? 'text-gray-800' : 'text-red-500'}`}>{o.total >= 0 ? '' : '−'}{money(Math.abs(o.total))}</p>
                </div>
              ))}
            </div>
          </div>
        )}

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
