'use client'

import { IconCard } from '@/components/icons'
import { useState } from 'react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const semAcento = (s: string) =>
  s.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()

type Nota = { id: string; codigo: number | null; descricao: string | null; pecas: string | null; vendedor: string; valor: number; vencimento: string | null; venda_id: string | null; vencida: boolean }
type Cliente = { nome: string; total: number; vencido: number; qtd: number; telefone: string | null; notas: Nota[] }

const fmtData = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')

// mensagem de cobrança pro WhatsApp — modelo que a Isa desenhou: saudação com o
// nome, saldo em aberto, período das notas, e o RELATÓRIO DE PEÇAS (uma linha por
// nota em aberto, com código, descrição e valor).
const mensagem = (c: Cliente) => {
  const datas = c.notas.map((n) => n.vencimento).filter(Boolean).sort() as string[]
  const periodo = datas.length
    ? ` (referente ao período de ${fmtData(datas[0])} a ${fmtData(datas[datas.length - 1])})`
    : ''
  const pecas = c.notas.map((n) => {
    // o produto ("2x Frontal iPhone") quando temos os itens; senão a descrição da nota
    const oQue = (n.pecas || '').trim() || (n.descricao || '').trim() || 'Compra'
    const nota = n.codigo ? `Nota ${n.codigo}: ` : ''
    return `• ${nota}${oQue} — ${fmt(n.valor)}`
  })
  return (
    `Olá, ${c.nome}! 😊\n` +
    `Passando pra lembrar do saldo em aberto de ${fmt(c.total)} aqui na TecnoCell${periodo}. ` +
    `Pedimos pelo acerto o quanto antes para mantermos tudo em dia. Qualquer dúvida, estamos à disposição.` +
    (pecas.length ? `\n\nSegue o relatório de peças:\n${pecas.join('\n')}` : '')
  )
}

// telefone -> só dígitos, com 55 na frente (Brasil)
const waLink = (tel: string, msg: string) => {
  let d = tel.replace(/\D/g, '')
  if (d.length <= 11) d = '55' + d
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`
}

export function FiadosClient({
  clientes,
  totalReceber,
  totalVencido,
  vendedores,
}: {
  clientes: Cliente[]
  totalReceber: number
  totalVencido: number
  vendedores: string[]
}) {
  const [busca, setBusca] = useState('')
  const [vendedorSel, setVendedorSel] = useState('')   // '' = todos
  const [copiado, setCopiado] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)

  // Filtro "quem vendeu": refaz as notas e os totais de cada cliente só com a
  // conta escolhida. Assim a atendente vê (e cobra) só os fiados dela — e as vendas
  // de outra conta (ex.: a que rodou o robô) ficam numa opção à parte. Foi a mistura
  // de contas na mesma lista que confundiu a cobrança das meninas.
  const clientesVend = vendedorSel
    ? clientes
        .map((c) => {
          const notas = c.notas.filter((n) => n.vendedor === vendedorSel)
          const total = notas.reduce((s, n) => s + n.valor, 0)
          const vencido = notas.filter((n) => n.vencida).reduce((s, n) => s + n.valor, 0)
          return { ...c, notas, total, vencido, qtd: notas.length }
        })
        .filter((c) => c.notas.length > 0)
        .sort((a, b) => b.total - a.total)
    : clientes

  const filtrados = busca.trim()
    ? clientesVend.filter((c) => semAcento(c.nome).includes(semAcento(busca)))
    : clientesVend

  // totais refletem o filtro de vendedor
  const totReceber = vendedorSel ? clientesVend.reduce((s, c) => s + c.total, 0) : totalReceber
  const totVencido = vendedorSel ? clientesVend.reduce((s, c) => s + c.vencido, 0) : totalVencido

  const copiar = async (c: Cliente) => {
    try {
      await navigator.clipboard.writeText(mensagem(c))
      setCopiado(c.nome)
      setTimeout(() => setCopiado((n) => (n === c.nome ? null : n)), 2500)
    } catch { /* clipboard bloqueado */ }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <IconCard className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Fiados</h2>
        </div>
        <p className="text-sm text-gray-400 mt-0.5">Quanto cada cliente deve — com cobrança pronta pro WhatsApp</p>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Total a receber</p>
          <p className="mt-1 text-xl font-bold text-[#1B6CA8] tabular-nums">{fmt(totReceber)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Vencido</p>
          <p className="mt-1 text-xl font-bold text-rose-600 tabular-nums">{fmt(totVencido)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Clientes devendo</p>
          <p className="mt-1 text-xl font-bold text-gray-800 tabular-nums">{clientesVend.length}</p>
        </div>
      </div>

      {/* Busca + filtro por vendedor */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente..."
          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]/30"
        />
        <select
          value={vendedorSel}
          onChange={(e) => setVendedorSel(e.target.value)}
          title="Quem vendeu"
          className={`rounded-xl border bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]/30 sm:w-64 ${vendedorSel ? 'border-[#1B6CA8] font-semibold text-[#1B6CA8]' : 'border-gray-200 text-gray-600'}`}
        >
          <option value="">👤 Todos os vendedores</option>
          {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {filtrados.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-400">
            {clientes.length === 0 ? 'Nenhum cliente com fiado em aberto. 🎉' : 'Nenhum cliente encontrado.'}
          </div>
        ) : filtrados.map((c) => {
          const estaAberto = aberto === c.nome
          return (
          <div key={c.nome} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <button
                onClick={() => setAberto(estaAberto ? null : c.nome)}
                className="flex flex-1 items-center gap-3 min-w-0 text-left">
                <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${estaAberto ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B6CA8]/10 text-sm font-bold text-[#1B6CA8]">
                  {c.nome[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{c.nome}</p>
                  <p className="text-xs text-gray-400">
                    {c.qtd} nota{c.qtd !== 1 ? 's' : ''} em aberto
                    {c.vencido > 0.01 && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">venceu {fmt(c.vencido)}</span>}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-gray-900 tabular-nums">{fmt(c.total)}</span>
                <button
                  onClick={() => copiar(c)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
                  {copiado === c.nome ? '✓ Copiado' : 'Copiar cobrança'}
                </button>
                {c.telefone && (
                  // eslint-disable-next-line react/jsx-no-target-blank
                  <a
                    href={waLink(c.telefone, mensagem(c))}
                    target="_blank" rel="noopener"
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition">
                    WhatsApp
                  </a>
                )}
              </div>
            </div>

            {/* Notas que ele deve */}
            {estaAberto && (
              <div className="border-t border-gray-100 bg-gray-50/60">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase text-gray-400">
                      <th className="px-5 py-2">Nota</th>
                      <th className="px-5 py-2">Vencimento</th>
                      <th className="px-5 py-2 text-right">Valor</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {c.notas.map((n) => (
                      <tr key={n.id} className="hover:bg-white">
                        <td className="px-5 py-2.5 text-gray-700">{n.descricao ?? (n.codigo ? `Fiado #${n.codigo}` : 'Lançamento')}</td>
                        <td className={`px-5 py-2.5 ${n.vencida ? 'font-medium text-rose-600' : 'text-gray-500'}`}>
                          {fmtData(n.vencimento)}{n.vencida && ' · vencida'}
                        </td>
                        <td className="px-5 py-2.5 text-right font-semibold text-gray-900 tabular-nums">{fmt(n.valor)}</td>
                        <td className="px-5 py-2.5 text-right">
                          <a href={`/painel/financeiro/${n.id}/editar`}
                            className="text-xs font-semibold text-[#1B6CA8] hover:underline">abrir →</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
