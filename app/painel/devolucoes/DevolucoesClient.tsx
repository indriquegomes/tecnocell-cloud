'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  buscarVendasRecentes, buscarVendaParaDevolucao, registrarDevolucao, buscarItensDevolucao,
  type DevolucaoResumo, type VendaParaDevolucao,
} from './actions'

const supabaseBrowser = createClient()

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const CREDITO_LABELS: Record<string, string> = {
  dinheiro: '💵 Dinheiro',
  pix: '💠 PIX',
  debito: '💳 Débito',
  credito: '💳 Crédito',
  cancelamento_fiado: '🚫 Cancelar fiado',
  sem_reembolso: '— Sem reembolso',
}

type Step = 'buscar' | 'itens' | 'confirmar'

export function DevolucoesClient({ devolucoes }: { devolucoes: DevolucaoResumo[] }) {
  const router = useRouter()

  // Modal nova devolução
  const [abrirModal, setAbrirModal] = useState(false)
  const [step, setStep] = useState<Step>('buscar')

  // Step 1 — buscar venda
  const [buscaVenda, setBuscaVenda] = useState('')
  const [vendasRecentes, setVendasRecentes] = useState<{ id: string; pessoa_nome: string | null; total: number; created_at: string }[]>([])
  const [carregandoBusca, setCarregandoBusca] = useState(false)
  const [vendaId, setVendaId] = useState('')

  // Step 2 — selecionar itens
  const [venda, setVenda] = useState<VendaParaDevolucao | null>(null)
  const [carregandoVenda, setCarregandoVenda] = useState(false)
  const [itensSelecionados, setItensSelecionados] = useState<Map<string, number>>(new Map())

  // Step 3 — confirmar
  const [motivo, setMotivo] = useState('')
  const [tipoCredito, setTipoCredito] = useState('dinheiro')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Modal detalhe
  const [detalhe, setDetalhe] = useState<{ dev: DevolucaoResumo; itens: { nome: string; quantidade: number; preco_unitario: number; total_item: number }[] } | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)

  const authToken = async () => {
    const { data } = await supabaseBrowser.auth.getSession()
    return data.session?.access_token ?? ''
  }

  const buscarVendas = useCallback(async (q: string) => {
    setCarregandoBusca(true)
    setErro('')
    try {
      const t = await authToken()
      if (!t) { setErro('Sessão expirada. Recarregue a página.'); return }
      const r = await buscarVendasRecentes(t, q)
      setVendasRecentes(r)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao buscar vendas.')
    } finally {
      setCarregandoBusca(false)
    }
  }, [])

  const selecionarVenda = async (id: string) => {
    setVendaId(id)
    setCarregandoVenda(true)
    try {
      const t = await authToken()
      const v = await buscarVendaParaDevolucao(t, id)
      setVenda(v)
      if (v) {
        const map = new Map<string, number>()
        v.itens.forEach((i) => map.set(i.produto_id, i.quantidade))
        setItensSelecionados(map)
        // Define tipo crédito inicial baseado no pagamento
        setTipoCredito(v.lancamento_pendente ? 'cancelamento_fiado' : 'dinheiro')
        setStep('itens')
      }
    } finally {
      setCarregandoVenda(false)
    }
  }

  const totalSelecionado = venda
    ? venda.itens.filter((i) => (itensSelecionados.get(i.produto_id) ?? 0) > 0).reduce((s, i) => {
        const qtd = itensSelecionados.get(i.produto_id) ?? 0
        return s + qtd * i.preco_unitario
      }, 0)
    : 0

  const confirmar = async () => {
    if (!venda) return
    setSalvando(true)
    setErro('')
    try {
      const t = await authToken()
      const itensDev = venda.itens
        .filter((i) => (itensSelecionados.get(i.produto_id) ?? 0) > 0)
        .map((i) => {
          const qtd = itensSelecionados.get(i.produto_id) ?? 0
          return { ...i, quantidade: qtd, total_item: qtd * i.preco_unitario }
        })
      if (itensDev.length === 0) { setErro('Selecione ao menos um item.'); return }
      await registrarDevolucao(t, {
        venda_id: venda.id,
        deposito_id: venda.deposito_id,
        pessoa_nome: venda.pessoa_nome,
        vendedor_nome: venda.vendedor_nome,
        motivo,
        tipo_credito: tipoCredito,
        itens: itensDev,
        lancamento_pendente: venda.lancamento_pendente,
      })
      fecharModal()
      router.refresh()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao registrar devolução.')
    } finally {
      setSalvando(false)
    }
  }

  const fecharModal = () => {
    setAbrirModal(false)
    setStep('buscar')
    setBuscaVenda('')
    setVendasRecentes([])
    setVenda(null)
    setVendaId('')
    setItensSelecionados(new Map())
    setMotivo('')
    setTipoCredito('dinheiro')
    setErro('')
  }

  const abrirDetalhe = async (dev: DevolucaoResumo) => {
    setCarregandoDetalhe(true)
    setDetalhe(null)
    try {
      const t = await authToken()
      const itens = await buscarItensDevolucao(t, dev.id)
      setDetalhe({ dev, itens })
    } finally {
      setCarregandoDetalhe(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Devoluções</h2>
        <button onClick={() => { setAbrirModal(true); buscarVendas('') }}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition">
          + Nova Devolução
        </button>
      </div>

      {/* Tabela de devoluções */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Vendedor</th>
              <th className="px-4 py-3">Crédito</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-2 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {devolucoes.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-14 text-center text-sm text-gray-400">Nenhuma devolução registrada.</td></tr>
            ) : devolucoes.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtData(d.created_at)}</td>
                <td className="px-4 py-3 text-gray-800">{d.pessoa_nome ?? <span className="text-gray-400 italic">—</span>}</td>
                <td className="px-4 py-3 text-gray-600">{d.vendedor_nome ?? <span className="text-gray-400 italic">—</span>}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{CREDITO_LABELS[d.tipo_credito] ?? d.tipo_credito}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{d.motivo ?? '—'}</td>
                <td className="px-4 py-3 text-right font-bold text-red-600">-{fmt(d.valor_total)}</td>
                <td className="px-2 py-3">
                  <button onClick={() => abrirDetalhe(d)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 transition">
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal nova devolução */}
      {abrirModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Nova Devolução</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {step === 'buscar' ? 'Passo 1 — Buscar venda' : step === 'itens' ? 'Passo 2 — Selecionar itens' : 'Passo 3 — Confirmar'}
                </p>
              </div>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">

              {/* Step 1: buscar venda */}
              {step === 'buscar' && (
                <div className="space-y-3">
                  <input
                    autoFocus
                    value={buscaVenda}
                    onChange={(e) => { setBuscaVenda(e.target.value); buscarVendas(e.target.value) }}
                    placeholder="Buscar por nome do cliente..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {erro && <p className="py-2 text-center text-sm text-red-500">{erro}</p>}
                  {carregandoBusca ? (
                    <p className="py-4 text-center text-sm text-gray-400">Buscando...</p>
                  ) : vendasRecentes.length === 0 && !erro ? (
                    <p className="py-4 text-center text-sm text-gray-400">Nenhuma venda encontrada.</p>
                  ) : (
                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                      {vendasRecentes.map((v) => (
                        <button key={v.id} onClick={() => selecionarVenda(v.id)}
                          className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-blue-50 transition text-left">
                          <div>
                            <p className="font-medium text-gray-800">{v.pessoa_nome ?? 'Cliente Final'}</p>
                            <p className="text-xs text-gray-400">{fmtData(v.created_at)}</p>
                          </div>
                          <span className="font-bold text-gray-900">{fmt(v.total)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {carregandoVenda && <p className="py-2 text-center text-sm text-gray-400">Carregando venda...</p>}
                </div>
              )}

              {/* Step 2: selecionar itens */}
              {step === 'itens' && venda && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
                    <p className="font-semibold text-gray-800">{venda.pessoa_nome ?? 'Cliente Final'}</p>
                    <p className="text-xs text-gray-500">{fmtData(venda.created_at)} · {venda.deposito_nome ?? '—'} · {venda.forma_pagamento_nome ?? '—'}</p>
                    {venda.lancamento_pendente && (
                      <p className="mt-1 text-xs font-semibold text-orange-600">⚠️ Fiado não pago — devolução cancela o débito (sem reembolso em dinheiro)</p>
                    )}
                  </div>

                  <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                    {venda.itens.map((item) => {
                      const qtd = itensSelecionados.get(item.produto_id) ?? 0
                      return (
                        <div key={item.produto_id} className="flex items-center gap-3 px-4 py-3">
                          <input type="checkbox" checked={qtd > 0}
                            onChange={(e) => {
                              const m = new Map(itensSelecionados)
                              m.set(item.produto_id, e.target.checked ? item.quantidade : 0)
                              setItensSelecionados(m)
                            }}
                            className="rounded border-gray-300" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.nome}</p>
                            <p className="text-xs text-gray-400">{fmt(item.preco_unitario)} un.</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => {
                              const m = new Map(itensSelecionados)
                              m.set(item.produto_id, Math.max(0, (m.get(item.produto_id) ?? 0) - 1))
                              setItensSelecionados(m)
                            }} className="rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-100">−</button>
                            <span className="w-8 text-center text-sm font-medium">{qtd}</span>
                            <button onClick={() => {
                              const m = new Map(itensSelecionados)
                              m.set(item.produto_id, Math.min(item.quantidade, (m.get(item.produto_id) ?? 0) + 1))
                              setItensSelecionados(m)
                            }} className="rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-100">+</button>
                          </div>
                          <span className="text-sm font-semibold text-gray-700 w-20 text-right">
                            {fmt(qtd * item.preco_unitario)}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-gray-600">Total a devolver</span>
                    <span className="text-red-600">{fmt(totalSelecionado)}</span>
                  </div>
                </div>
              )}

              {/* Step 3: confirmar */}
              {step === 'confirmar' && venda && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm space-y-1">
                    <p className="font-semibold text-gray-800">{venda.pessoa_nome ?? 'Cliente Final'}</p>
                    <p className="text-gray-500">{venda.itens.filter((i) => (itensSelecionados.get(i.produto_id) ?? 0) > 0).length} item(ns) · {fmt(totalSelecionado)}</p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase text-gray-500">Motivo (opcional)</label>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex: produto com defeito, troca de tamanho..."
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase text-gray-500">Como devolver o dinheiro?</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {venda.lancamento_pendente ? (
                        <button className="col-span-2 rounded-xl border-2 border-orange-400 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700">
                          🚫 Cancelar fiado (sem reembolso)
                        </button>
                      ) : (
                        ['dinheiro', 'pix', 'debito', 'credito', 'sem_reembolso'].map((op) => (
                          <button key={op} onClick={() => setTipoCredito(op)}
                            className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
                              tipoCredito === op ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}>
                            {CREDITO_LABELS[op]}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {erro && <p className="text-sm text-red-600">{erro}</p>}
                </div>
              )}
            </div>

            {/* Footer com botões de navegação */}
            <div className="border-t border-gray-100 px-6 py-4 flex gap-3">
              {step !== 'buscar' && (
                <button onClick={() => setStep(step === 'confirmar' ? 'itens' : 'buscar')}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                  ← Voltar
                </button>
              )}
              {step === 'itens' && (
                <button onClick={() => { if (totalSelecionado > 0) setStep('confirmar') }}
                  disabled={totalSelecionado === 0}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-40">
                  Próximo →
                </button>
              )}
              {step === 'confirmar' && (
                <button onClick={confirmar} disabled={salvando}
                  className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 transition disabled:opacity-50">
                  {salvando ? 'Registrando...' : `Confirmar devolução — ${fmt(totalSelecionado)}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal detalhe */}
      {(detalhe || carregandoDetalhe) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetalhe(null)}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Detalhe da Devolução</h3>
              <button onClick={() => setDetalhe(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {carregandoDetalhe && !detalhe ? (
              <p className="py-14 text-center text-sm text-gray-400">Carregando...</p>
            ) : detalhe ? (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Data', valor: fmtData(detalhe.dev.created_at) },
                    { label: 'Cliente', valor: detalhe.dev.pessoa_nome ?? '—' },
                    { label: 'Vendedor', valor: detalhe.dev.vendedor_nome ?? '—' },
                    { label: 'Crédito', valor: CREDITO_LABELS[detalhe.dev.tipo_credito] ?? detalhe.dev.tipo_credito },
                    { label: 'Motivo', valor: detalhe.dev.motivo ?? '—' },
                  ].map(({ label, valor }) => (
                    <div key={label}>
                      <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
                      <p className="text-gray-800">{valor}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-xs font-semibold uppercase text-gray-400">
                        <th className="px-3 py-2 text-left">Produto</th>
                        <th className="px-3 py-2 text-right">Qtd</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detalhe.itens.map((i, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-gray-800">{i.nome}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{i.quantidade}</td>
                          <td className="px-3 py-2 text-right font-semibold text-red-600">-{fmt(i.total_item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end text-sm font-bold gap-4">
                  <span className="text-gray-600">Total devolvido</span>
                  <span className="text-red-600">-{fmt(detalhe.dev.valor_total)}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
