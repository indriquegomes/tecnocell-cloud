'use client'

import { IconCard } from '@/components/icons'
import { BuscaAvancada } from '@/components/BuscaAvancada'
import { montarMensagemCobranca } from '@/lib/cobranca-fiado'
import { hojeSP } from '@/lib/utils'
import { useState } from 'react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const semAcento = (s: string) =>
  s.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()

type Nota = { id: string; codigo: number | null; descricao: string | null; pecas: string | null; vendedor: string; loja: string; valor: number; vencimento: string | null; venda_id: string | null; vencida: boolean }
type Cliente = { nome: string; total: number; vencido: number; qtd: number; telefone: string | null; notas: Nota[] }

const fmtData = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')

type Pix = { chave: string; titular: string | null }

// Pix da loja do cliente. Antes a cobrança saía sem Pix e as meninas mandavam
// a chave à parte, num contato separado — por isso quase ninguém usava a
// cobrança do sistema, mesmo ela já existindo pronta.
//
// A loja vem das NOTAS: cada cliente é de uma loja só (confirmado pelo dono em
// 26/08) e `pessoas` não tem loja_id, então as notas dele são todas da mesma.
// O desempate por maior valor é só uma rede de segurança pro caso de um dia
// aparecer cliente com nota nas duas — nunca fica sem Pix por causa disso.
const blocoPix = (c: Cliente, pixPorLoja: Record<string, Pix>) => {
  const porLoja: Record<string, number> = {}
  for (const n of c.notas) porLoja[n.loja] = (porLoja[n.loja] ?? 0) + n.valor
  const lojaPrincipal = Object.entries(porLoja).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const pix = pixPorLoja[lojaPrincipal] ?? pixPorLoja['__geral__']
  if (!pix) return ''   // sem chave cadastrada: a mensagem sai como era antes
  return `\n\n💠 PIX: ${pix.chave}` + (pix.titular ? `\n👤 Em nome de: ${pix.titular}` : '')
}

const mensagem = (c: Cliente, pixPorLoja: Record<string, Pix> = {}) =>
  montarMensagemCobranca(c, hojeSP(), blocoPix(c, pixPorLoja))

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
  lojas,
  pixPorLoja = {},
}: {
  clientes: Cliente[]
  totalReceber: number
  totalVencido: number
  vendedores: string[]
  lojas: string[]
  /** Pix de cada loja (da conta), pra sair na cobranca do cliente */
  pixPorLoja?: Record<string, Pix>
}) {
  const [busca, setBusca] = useState('')
  const [vendedorSel, setVendedorSel] = useState('')   // '' = todos
  const [lojaSel, setLojaSel] = useState('')            // '' = todas
  const [copiado, setCopiado] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [ordem, setOrdem] = useState<'nome' | 'total'>('nome')   // Isa: padrão alfabético

  // Filtro "quem vendeu": refaz as notas e os totais de cada cliente só com a
  // conta escolhida. Assim a atendente vê (e cobra) só os fiados dela — e as vendas
  // de outra conta (ex.: a que rodou o robô) ficam numa opção à parte. Foi a mistura
  // de contas na mesma lista que confundiu a cobrança das meninas.
  const temFiltro = !!(vendedorSel || lojaSel)
  const clientesVend = temFiltro
    ? clientes
        .map((c) => {
          const notas = c.notas.filter((n) =>
            (!vendedorSel || n.vendedor === vendedorSel) && (!lojaSel || n.loja === lojaSel))
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

  // Ordenação (Isa 26/07): alfabética por padrão; toggle pra "maior dívida".
  // localeCompare pt-BR ignora acento e maiúsc/minúsc — A→Z de verdade.
  const ordenados = [...filtrados].sort((a, b) =>
    ordem === 'nome'
      ? a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
      : b.total - a.total,
  )

  // totais refletem os filtros (vendedor + loja)
  const totReceber = temFiltro ? clientesVend.reduce((s, c) => s + c.total, 0) : totalReceber
  const totVencido = temFiltro ? clientesVend.reduce((s, c) => s + c.vencido, 0) : totalVencido

  const copiar = async (c: Cliente) => {
    try {
      await navigator.clipboard.writeText(mensagem(c, pixPorLoja))
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

      {/* Busca principal */}
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar cliente..."
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]/30"
      />

      {/* 🔎 Busca Avançada: vendedor, loja, ordenação */}
      <BuscaAvancada ativo={!!(vendedorSel || lojaSel)}>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={vendedorSel}
            onChange={(e) => setVendedorSel(e.target.value)}
            title="Quem vendeu"
            className={`rounded-xl border bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]/30 ${vendedorSel ? 'border-[#1B6CA8] font-semibold text-[#1B6CA8]' : 'border-gray-200 text-gray-600'}`}
          >
            <option value="">👤 Todos os vendedores</option>
            {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          {lojas.length > 1 && (
            <select
              value={lojaSel}
              onChange={(e) => setLojaSel(e.target.value)}
              title="Loja"
              className={`rounded-xl border bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]/30 ${lojaSel ? 'border-[#1B6CA8] font-semibold text-[#1B6CA8]' : 'border-gray-200 text-gray-600'}`}
            >
              <option value="">🏬 Todas as lojas</option>
              {lojas.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          {/* Ordenação — alfabética por padrão (Isa) */}
          <div className="flex shrink-0 rounded-xl border border-gray-200 bg-white p-1">
            {([['nome', 'A→Z'], ['total', 'Maior dívida']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setOrdem(k)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${ordem === k ? 'bg-[#1B6CA8] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </BuscaAvancada>

      {/* Lista */}
      <div className="space-y-2">
        {ordenados.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-400">
            {clientes.length === 0 ? 'Nenhum cliente com fiado em aberto. 🎉' : 'Nenhum cliente encontrado.'}
          </div>
        ) : ordenados.map((c) => {
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
                    href={waLink(c.telefone, mensagem(c, pixPorLoja))}
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
                      <th className="px-5 py-2">Loja</th>
                      <th className="px-5 py-2">Vencimento</th>
                      <th className="px-5 py-2 text-right">Valor</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {c.notas.map((n) => (
                      <tr key={n.id} className="hover:bg-white">
                        <td className="px-5 py-2.5 text-gray-700">{n.descricao ?? (n.codigo ? `Fiado #${n.codigo}` : 'Lançamento')}</td>
                        <td className="px-5 py-2.5">
                          {n.loja
                            ? <span className="rounded-md bg-[#1B6CA8]/10 px-2 py-0.5 text-xs font-medium text-[#1B6CA8]">🏬 {n.loja}</span>
                            : <span className="text-xs text-gray-300">—</span>}
                        </td>
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
