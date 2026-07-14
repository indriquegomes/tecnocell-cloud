'use client'

import { IconCard } from '@/components/icons'
import { useState } from 'react'
import { emitirCredito, estornarCredito } from './actions'
import { ConfirmButton } from '@/components/ConfirmButton'
import { SubmitButton } from '@/components/SubmitButton'
import { CampoDinheiro } from '@/components/CampoDinheiro'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
const semAcento = (s: string) =>
  s.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()

type Movimento = {
  id: string
  pessoa_id: string
  pessoa_nome: string | null
  valor: number
  tipo: string
  descricao: string | null
  devolucao_id: string | null
  created_at: string
}

type ClienteComSaldo = {
  id: string
  nome: string
  saldo: number
  movimentos: Movimento[]
}

type DetalheDevolucao = {
  vendaNumero: number | null
  motivo: string | null
  itens: { nome: string; quantidade: number; preco_unitario: number }[]
}

export function CreditosClient({
  clientes,
  pessoas,
  totalEmCirculacao,
  clienteFiltroInicial,
  detalhesDevolucao,
  erro,
  ok,
}: {
  clientes: ClienteComSaldo[]
  pessoas: { id: string; nome: string }[]
  totalEmCirculacao: number
  clienteFiltroInicial: string
  detalhesDevolucao: Record<string, DetalheDevolucao>
  erro?: string
  ok?: string
}) {
  const [busca, setBusca] = useState(clienteFiltroInicial)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [mostrarEmitir, setMostrarEmitir] = useState(false)

  // Busca de cliente no modal Emitir (sem precisar rolar a lista inteira)
  const [buscaEmit, setBuscaEmit] = useState('')
  const [clienteEmit, setClienteEmit] = useState<{ id: string; nome: string } | null>(null)
  const abrirEmitir = () => { setClienteEmit(null); setBuscaEmit(''); setMostrarEmitir(true) }
  const pessoasEmit = buscaEmit.trim() && !clienteEmit
    ? pessoas.filter((p) => semAcento(p.nome).includes(semAcento(buscaEmit))).slice(0, 8)
    : []

  const clientesFiltrados = busca.trim()
    ? clientes.filter((c) => semAcento(c.nome).includes(semAcento(busca)))
    : clientes

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <IconCard className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Créditos de Clientes</h2>
        <button
          onClick={abrirEmitir}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
          + Emitir Crédito
        </button>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
      {ok && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Crédito emitido com sucesso!</div>}

      {/* Cards resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Total em circulação</p>
          <p className="mt-1 text-xl font-bold text-blue-600">{fmt(totalEmCirculacao)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Clientes com saldo</p>
          <p className="mt-1 text-xl font-bold text-gray-800">{clientes.filter((c) => c.saldo > 0.01).length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Total de clientes</p>
          <p className="mt-1 text-xl font-bold text-gray-800">{clientes.length}</p>
        </div>
      </div>

      {/* Busca */}
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar cliente..."
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Lista de clientes */}
      <div className="space-y-2">
        {clientesFiltrados.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-400">
            Nenhum cliente com crédito encontrado.
          </div>
        )}
        {clientesFiltrados.map((c) => {
          const aberto = expandido === c.id
          return (
            <div key={c.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {/* Linha do cliente */}
              <button
                onClick={() => setExpandido(aberto ? null : c.id)}
                className="flex w-full items-center justify-between px-5 py-4 hover:bg-gray-50 transition text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                    {c.nome[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{c.nome}</p>
                    <p className="text-xs text-gray-400">{c.movimentos.length} movimento{c.movimentos.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${c.saldo > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {fmt(Math.max(0, c.saldo))}
                  </span>
                  <span className="text-gray-400 text-sm">{aberto ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Histórico expandido */}
              {aberto && (
                <div className="border-t border-gray-100">
                  <table className="min-w-full divide-y divide-gray-50 text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-xs font-semibold uppercase text-gray-400">
                        <th className="px-5 py-2.5">Data</th>
                        <th className="px-5 py-2.5">Descrição</th>
                        <th className="px-5 py-2.5 text-center">Tipo</th>
                        <th className="px-5 py-2.5 text-right">Valor</th>
                        <th className="px-5 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {c.movimentos.map((m) => (
                        <tr key={m.id} className="hover:bg-blue-50/60">
                          <td className="px-5 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtData(m.created_at)}</td>
                          <td className="px-5 py-2.5 text-gray-600">
                            <div>
                              <span>{m.descricao ?? '—'}</span>
                              {m.devolucao_id && detalhesDevolucao[m.devolucao_id] && (() => {
                                const dev = detalhesDevolucao[m.devolucao_id!]
                                return (
                                  <div className="mt-1 space-y-0.5">
                                    {dev.vendaNumero && (
                                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600 font-medium">
                                        ↩ Venda #{dev.vendaNumero}
                                      </span>
                                    )}
                                    {dev.itens.map((i, idx) => (
                                      <div key={idx} className="text-xs text-gray-400">
                                        {i.quantidade}x {i.nome} · {fmt(i.preco_unitario)}
                                      </div>
                                    ))}
                                    {dev.motivo && (
                                      <div className="text-xs text-gray-400 italic">"{dev.motivo}"</div>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                          </td>
                          <td className="px-5 py-2.5 text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              m.tipo === 'credito' ? 'bg-green-100 text-green-700' :
                              m.tipo === 'uso' ? 'bg-blue-100 text-blue-600' :
                              'bg-red-100 text-red-600'
                            }`}>
                              {m.tipo === 'credito' ? '+ Crédito' : m.tipo === 'uso' ? '✓ Usado' : '− Estorno'}
                            </span>
                          </td>
                          <td className={`px-5 py-2.5 text-right font-semibold ${
                            m.tipo === 'credito' ? 'text-green-600' :
                            m.tipo === 'uso' ? 'text-blue-600' :
                            'text-red-500'
                          }`}>
                            {m.tipo === 'uso' ? '−' : m.tipo === 'estorno' ? '−' : '+'}{fmt(m.valor ?? 0)}
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            {m.tipo === 'credito' && (
                              <form action={estornarCredito.bind(null, m.id)}>
                                <ConfirmButton message="Estornar este crédito?" className="text-xs text-red-400 hover:text-red-600 font-medium">
                                  Estornar
                                </ConfirmButton>
                              </form>
                            )}
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

      {/* Modal emitir crédito */}
      {mostrarEmitir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Emitir Crédito Manual</h3>
              <button onClick={() => setMostrarEmitir(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form action={async (fd) => { await emitirCredito(fd); setMostrarEmitir(false) }} className="p-6 space-y-4">
              <div className="relative">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Cliente <span className="text-red-500">*</span></label>
                <input type="hidden" name="pessoa_id" value={clienteEmit?.id ?? ''} />
                {clienteEmit ? (
                  <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
                    <span className="text-sm font-medium text-gray-800">{clienteEmit.nome}</span>
                    <button type="button" onClick={() => { setClienteEmit(null); setBuscaEmit('') }}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800">trocar</button>
                  </div>
                ) : (
                  <>
                    <input
                      autoFocus
                      value={buscaEmit}
                      onChange={(e) => setBuscaEmit(e.target.value)}
                      className="field w-full"
                      placeholder="Digite o nome do cliente..."
                    />
                    {pessoasEmit.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                        {pessoasEmit.map((p) => (
                          <button key={p.id} type="button"
                            onMouseDown={(e) => { e.preventDefault(); setClienteEmit({ id: p.id, nome: p.nome }); setBuscaEmit('') }}
                            className="block w-full px-4 py-2.5 text-left text-sm text-gray-800 hover:bg-blue-50 transition">
                            {p.nome}
                          </button>
                        ))}
                      </div>
                    )}
                    {buscaEmit.trim() && pessoasEmit.length === 0 && (
                      <p className="mt-1 text-xs text-gray-400">Nenhum cliente encontrado.</p>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor (R$) <span className="text-red-500">*</span></label>
                <CampoDinheiro name="valor" required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Motivo</label>
                <input name="descricao" className="field w-full" placeholder="Ex: Vale de troca, bônus..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setMostrarEmitir(false)}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <SubmitButton disabled={!clienteEmit} pendingText="Emitindo..."
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition">
                  Emitir
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
