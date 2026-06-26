'use client'

import { useState, useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { registrarDevolucao, registrarAcerto, criarConsignado, buscarClientesConsignado, buscarProdutosConsignado, type ActionState } from './actions'

const fmt = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type ItemConsignado = {
  id: string
  nome: string
  quantidade: number
  devolvido: number
  preco_unitario: number
}

type Consignado = {
  id: string
  pessoa_nome: string | null
  observacoes: string | null
  status: string
  total: number
  created_at: string
  itens: ItemConsignado[]
}

const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto',
  devolvido: 'Devolvido',
  acertado: 'Acertado',
  parcial: 'Parcial',
}
const STATUS_CLS: Record<string, string> = {
  aberto: 'bg-yellow-100 text-yellow-800',
  devolvido: 'bg-green-100 text-green-700',
  acertado: 'bg-blue-100 text-blue-700',
  parcial: 'bg-orange-100 text-orange-700',
}

function BadgeStatus({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function FeedbackMsg({ state }: { state: ActionState }) {
  if (!state) return null
  return (
    <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${state.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
      {state.message}
    </div>
  )
}

function PainelDevolucao({ consignado, onFechar }: { consignado: Consignado; onFechar: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registrarDevolucao, null)
  const pendentes = consignado.itens.filter((i) => (i.devolvido ?? 0) < i.quantidade)

  if (state?.ok) {
    return (
      <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-sm text-green-700 font-medium">{state.message}</p>
        <button onClick={onFechar} className="mt-2 text-xs text-green-600 underline">Fechar</button>
      </div>
    )
  }

  return (
    <form action={action} className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <input type="hidden" name="consignado_id" value={consignado.id} />
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Registrar Devolução</p>
      {pendentes.length === 0 ? (
        <p className="text-sm text-gray-400">Todos os itens já foram devolvidos.</p>
      ) : (
        <div className="space-y-2">
          {pendentes.map((item) => {
            const pendente = item.quantidade - (item.devolvido ?? 0)
            return (
              <div key={item.id} className="flex items-center gap-3">
                <div className="flex-1 text-sm">
                  <span className="font-medium text-gray-700">{item.nome}</span>
                  <span className="text-gray-400 ml-2 text-xs">{pendente} pendente{pendente > 1 ? 's' : ''}</span>
                </div>
                <input
                  name={`devolvido_${item.id}`}
                  type="number"
                  min="0"
                  max={pendente}
                  defaultValue={pendente}
                  className="field w-20 text-center"
                />
              </div>
            )
          })}
        </div>
      )}
      <FeedbackMsg state={state} />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onFechar} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
          Cancelar
        </button>
        {pendentes.length > 0 && (
          <button type="submit" disabled={pending} className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition disabled:opacity-50">
            {pending ? 'Salvando...' : 'Confirmar Devolução'}
          </button>
        )}
      </div>
    </form>
  )
}

function PainelAcerto({
  consignado,
  formas,
  onFechar,
}: {
  consignado: Consignado
  formas: { id: string; nome: string }[]
  onFechar: () => void
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registrarAcerto, null)
  const itensAcertar = consignado.itens.filter((i) => (i.devolvido ?? 0) < i.quantidade)
  const totalAcerto = itensAcertar.reduce(
    (s, i) => s + (i.quantidade - (i.devolvido ?? 0)) * (i.preco_unitario ?? 0),
    0,
  )

  if (state?.ok) {
    return (
      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm text-blue-700 font-medium">{state.message}</p>
        <button onClick={onFechar} className="mt-2 text-xs text-blue-600 underline">Fechar</button>
      </div>
    )
  }

  return (
    <form action={action} className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <input type="hidden" name="consignado_id" value={consignado.id} />
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Acerto Financeiro</p>

      {itensAcertar.length === 0 ? (
        <p className="text-sm text-gray-400">Todos os itens já foram devolvidos. Nada a acertar.</p>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 text-sm">
            {itensAcertar.map((item) => {
              const qty = item.quantidade - (item.devolvido ?? 0)
              return (
                <div key={item.id} className="flex justify-between px-3 py-2">
                  <span className="text-gray-600">{item.nome} <span className="text-gray-400">× {qty}</span></span>
                  <span className="font-semibold text-gray-800">{fmt(qty * (item.preco_unitario ?? 0))}</span>
                </div>
              )
            })}
            <div className="flex justify-between px-3 py-2 bg-blue-50 font-bold text-blue-800">
              <span>Total a cobrar</span>
              <span>{fmt(totalAcerto)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Forma de Pagamento</label>
              <select name="forma_pagamento_id" className="field text-sm" required>
                <option value="">Selecione...</option>
                {formas.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Observações</label>
              <input name="obs" className="field text-sm" placeholder="Opcional" />
            </div>
          </div>
        </>
      )}

      <FeedbackMsg state={state} />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onFechar} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
          Cancelar
        </button>
        {itensAcertar.length > 0 && (
          <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50">
            {pending ? 'Salvando...' : 'Confirmar Acerto'}
          </button>
        )}
      </div>
    </form>
  )
}

function LinhaConsignado({ c, formas }: { c: Consignado; formas: { id: string; nome: string }[] }) {
  const [painel, setPainel] = useState<'itens' | 'devolucao' | 'acerto' | null>(null)
  const toggle = (p: typeof painel) => setPainel((prev) => (prev === p ? null : p))
  const fechar = () => setPainel(null)

  const totalItens = c.itens.length
  const devolvidos = c.itens.filter((i) => (i.devolvido ?? 0) >= i.quantidade).length
  const encerrado = c.status === 'devolvido' || c.status === 'acertado'

  return (
    <>
      <tr className="hover:bg-gray-50/50 transition-colors">
        <td className="px-6 py-4 text-gray-500 whitespace-nowrap text-sm">
          {new Date(c.created_at).toLocaleDateString('pt-BR')}
        </td>
        <td className="px-6 py-4 font-medium text-gray-900 text-sm">
          {c.pessoa_nome ?? <span className="text-gray-400 italic">Sem cliente</span>}
        </td>
        <td className="px-6 py-4 text-gray-600 text-sm">
          {totalItens} {totalItens === 1 ? 'item' : 'itens'}
          {devolvidos > 0 && <span className="ml-1.5 text-xs text-green-600">({devolvidos} devolvido{devolvidos > 1 ? 's' : ''})</span>}
        </td>
        <td className="px-6 py-4 font-semibold text-gray-900 text-sm">{fmt(c.total ?? 0)}</td>
        <td className="px-6 py-4"><BadgeStatus status={c.status} /></td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-medium">
            <button
              onClick={() => toggle('itens')}
              className={`transition ${painel === 'itens' ? 'text-gray-900 underline' : 'text-gray-500 hover:text-gray-800'}`}
            >
              Ver itens
            </button>
            {!encerrado && (
              <>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => toggle('devolucao')}
                  className={`transition ${painel === 'devolucao' ? 'text-green-800 underline' : 'text-green-600 hover:text-green-800'}`}
                >
                  Devolução
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => toggle('acerto')}
                  className={`transition ${painel === 'acerto' ? 'text-purple-900 underline' : 'text-purple-600 hover:text-purple-900'}`}
                >
                  Acerto
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {painel !== null && (
        <tr>
          <td colSpan={6} className="px-6 pb-4">
            {painel === 'itens' && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-100 text-sm overflow-hidden">
                {c.itens.map((item) => {
                  const pendente = item.quantidade - (item.devolvido ?? 0)
                  return (
                    <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <span className="font-medium text-gray-700">{item.nome}</span>
                        <span className="text-gray-400 ml-2 text-xs">
                          {item.quantidade} saíu · {item.devolvido ?? 0} devolvido · {pendente} pendente
                        </span>
                      </div>
                      <span className="font-semibold text-gray-700">{fmt((item.preco_unitario ?? 0) * item.quantidade)}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {painel === 'devolucao' && (
              <PainelDevolucao consignado={c} onFechar={fechar} />
            )}
            {painel === 'acerto' && (
              <PainelAcerto consignado={c} formas={formas} onFechar={fechar} />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

type ItemLista = { produto_id: string; nome: string; quantidade: number; preco_unitario: number }

function ModalNovasSaida({ onFechar }: { onFechar: () => void }) {
  const router = useRouter()
  const [pessoaNome, setPessoaNome] = useState('')
  const [pessoaId, setPessoaId] = useState<string | null>(null)
  const [sugestoesCliente, setSugestoesCliente] = useState<{ id: string; nome: string; telefone: string | null }[]>([])
  const [buscaProduto, setBuscaProduto] = useState('')
  const [sugestoesProd, setSugestoesProd] = useState<{ id: string; nome: string; preco: number }[]>([])
  const [itens, setItens] = useState<ItemLista[]>([])
  const [qtdTemp, setQtdTemp] = useState('1')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const q = pessoaNome.trim()
    if (!q || pessoaId) { setSugestoesCliente([]); return }
    const t = setTimeout(async () => setSugestoesCliente(await buscarClientesConsignado(q)), 250)
    return () => clearTimeout(t)
  }, [pessoaNome, pessoaId])

  useEffect(() => {
    const q = buscaProduto.trim()
    if (!q) { setSugestoesProd([]); return }
    const t = setTimeout(async () => setSugestoesProd(await buscarProdutosConsignado(q)), 250)
    return () => clearTimeout(t)
  }, [buscaProduto])

  const adicionarItem = (p: { id: string; nome: string; preco: number }) => {
    const qty = parseInt(qtdTemp) || 1
    setItens(prev => {
      const exists = prev.find(i => i.produto_id === p.id)
      if (exists) return prev.map(i => i.produto_id === p.id ? { ...i, quantidade: i.quantidade + qty } : i)
      return [...prev, { produto_id: p.id, nome: p.nome, quantidade: qty, preco_unitario: p.preco }]
    })
    setBuscaProduto(''); setSugestoesProd([]); setQtdTemp('1')
  }

  const handleSalvar = async () => {
    if (itens.length === 0) { setErro('Adicione pelo menos um item.'); return }
    setSalvando(true); setErro('')
    const fd = new FormData()
    if (pessoaId) fd.set('pessoa_id', pessoaId)
    fd.set('pessoa_nome', pessoaNome)
    fd.set('observacoes', obs)
    fd.set('itens', JSON.stringify(itens))
    const res = await criarConsignado(fd)
    if (res?.ok) { onFechar(); router.refresh() }
    else { setErro(res?.message ?? 'Erro'); setSalvando(false) }
  }

  const total = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onFechar}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <h3 className="text-base font-bold text-gray-900">Nova Saída Consignada</h3>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Cliente */}
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">Cliente</label>
            <div className="relative">
              <input value={pessoaNome} onChange={e => { setPessoaNome(e.target.value); if (pessoaId) setPessoaId(null) }}
                placeholder="Buscar cliente..." className="field w-full" />
              {sugestoesCliente.length > 0 && !pessoaId && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
                  {sugestoesCliente.map(c => (
                    <button key={c.id} type="button"
                      onMouseDown={e => { e.preventDefault(); setPessoaId(c.id); setPessoaNome(c.nome); setSugestoesCliente([]) }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-blue-50 text-left">
                      <span className="font-medium text-gray-800">{c.nome}</span>
                      {c.telefone && <span className="text-xs text-gray-400">{c.telefone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {pessoaId && <p className="mt-1 text-xs text-green-600">✓ {pessoaNome}</p>}
          </div>

          {/* Produto */}
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">Adicionar Produto</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input value={buscaProduto} onChange={e => setBuscaProduto(e.target.value)}
                  placeholder="Buscar produto..." className="field w-full" />
                {sugestoesProd.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
                    {sugestoesProd.map(p => (
                      <button key={p.id} type="button"
                        onMouseDown={e => { e.preventDefault(); adicionarItem(p) }}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-blue-50 text-left">
                        <span className="font-medium text-gray-800">{p.nome}</span>
                        <span className="text-xs text-blue-600 font-semibold">{fmt(p.preco)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input value={qtdTemp} onChange={e => setQtdTemp(e.target.value)}
                type="number" min="1" placeholder="Qtd" className="field w-16 text-center" />
            </div>
          </div>

          {/* Lista de itens */}
          {itens.length > 0 && (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              {itens.map((item, idx) => (
                <div key={item.produto_id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${idx > 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{item.nome}</p>
                    <p className="text-xs text-gray-400">{fmt(item.preco_unitario)} × {item.quantidade}</p>
                  </div>
                  <span className="font-semibold text-gray-700">{fmt(item.quantidade * item.preco_unitario)}</span>
                  <button onClick={() => setItens(prev => prev.filter(i => i.produto_id !== item.produto_id))}
                    className="text-gray-300 hover:text-red-400 text-xs transition">✕</button>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2 bg-gray-50 border-t border-gray-100 text-sm font-bold text-gray-800">
                <span>Total</span><span>{fmt(total)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Opcional..." className="field w-full resize-none text-sm" />
          </div>

          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex gap-3 shrink-0">
          <button onClick={onFechar}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleSalvar} disabled={salvando || itens.length === 0}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition">
            {salvando ? 'Registrando...' : `✓ Registrar Saída${total > 0 ? ' · ' + fmt(total) : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConsignadoClient({
  abertos,
  historico,
  formas,
}: {
  abertos: Consignado[]
  historico: Consignado[]
  formas: { id: string; nome: string }[]
}) {
  const [modalNova, setModalNova] = useState(false)

  return (
    <>
      {modalNova && <ModalNovasSaida onFechar={() => setModalNova(false)} />}

      {/* Saídas abertas */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Saídas Abertas</h3>
          <div className="flex items-center gap-2">
            {abertos.length > 0 && (
              <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-2.5 py-0.5">
                {abertos.length} pendente{abertos.length > 1 ? 's' : ''}
              </span>
            )}
            <button onClick={() => setModalNova(true)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition">
              + Nova Saída
            </button>
          </div>
        </div>
        {abertos.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">Nenhuma saída em aberto.</p>
            <p className="text-xs text-gray-300 mt-1">Use F12 no PDV para registrar uma saída consignada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/60 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-medium">Data</th>
                  <th className="px-6 py-3 text-left font-medium">Cliente</th>
                  <th className="px-6 py-3 text-left font-medium">Itens</th>
                  <th className="px-6 py-3 text-left font-medium">Total</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-left font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {abertos.map((c) => <LinhaConsignado key={c.id} c={c} formas={formas} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Histórico */}
      {historico.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-sm font-semibold text-gray-900">Histórico</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/60 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-medium">Data</th>
                  <th className="px-6 py-3 text-left font-medium">Cliente</th>
                  <th className="px-6 py-3 text-left font-medium">Itens</th>
                  <th className="px-6 py-3 text-left font-medium">Total</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {historico.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors opacity-70">
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4 text-gray-700">{c.pessoa_nome ?? '—'}</td>
                    <td className="px-6 py-4 text-gray-500">{c.itens.length} itens</td>
                    <td className="px-6 py-4 text-gray-700">{fmt(c.total ?? 0)}</td>
                    <td className="px-6 py-4"><BadgeStatus status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
