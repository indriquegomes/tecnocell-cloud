'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { adicionarItemPedido, removerItemPedido, atualizarStatusPedido, atualizarInfoPedido, atualizarDescontoFrete, atualizarObservacoesTermos, cancelarComMotivo, faturarPedido } from '../actions'
import { gerarOSDePedido } from '@/app/painel/os/actions'
import { formatDate } from '@/lib/utils'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

const ORIGEM_LABEL: Record<string, string> = {
  balcao:    'Balcão',
  whatsapp:  'WhatsApp',
  telefone:  'Telefone',
  instagram: 'Instagram',
  outro:     'Outro',
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', aprovado: 'Aprovado', faturado: 'Faturado', cancelado: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  rascunho:  'bg-gray-100 text-gray-500',
  aprovado:  'bg-blue-100 text-blue-700',
  faturado:  'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-600',
}

type Item = {
  id: string
  produto_id: string
  quantidade: number
  preco_unitario: number
  total_item: number
  produtos: { id: string; nome: string; preco: number } | null
}

type Produto = { id: string; nome: string; preco: number }

export function PedidoDetalheClient({
  pedido,
  itensIniciais,
  produtos,
  precoTabela,
  depositos,
  formas,
}: {
  pedido: {
    id: string
    numero: number | null
    tipo: string
    status: string
    total: number
    data_validade: string | null
    observacoes: string | null
    created_at: string
    pessoa_nome: string | null
    deposito_id: string | null
    deposito_nome: string | null
    forma_pagamento_id: string | null
    forma_pagamento_nome: string | null
    vendedor_nome: string | null
    origem: string | null
    desconto: number
    frete: number
    referencia_cliente: string | null
    termos_condicoes: string | null
    motivo_cancelamento: string | null
  }
  itensIniciais: Item[]
  produtos: Produto[]
  precoTabela: Record<string, number>
  depositos: { id: string; nome: string }[]
  formas: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [itens, setItens] = useState(itensIniciais)
  useEffect(() => { setItens(itensIniciais) }, [itensIniciais])

  // Edição inline dos info cards
  const [editandoInfo, setEditandoInfo] = useState(false)
  const [infoDepositoId, setInfoDepositoId] = useState<string>(pedido.deposito_id ?? '')
  const [infoFormaId, setInfoFormaId] = useState<string>(pedido.forma_pagamento_id ?? '')
  const [infoOrigem, setInfoOrigem] = useState(pedido.origem ?? 'balcao')
  const [salvandoInfo, setSalvandoInfo] = useState(false)

  // Desconto e frete
  const [desconto, setDesconto] = useState(pedido.desconto)
  const [frete, setFrete] = useState(pedido.frete)
  const [editandoTotal, setEditandoTotal] = useState(false)
  const [salvandoTotal, setSalvandoTotal] = useState(false)

  const handleSalvarTotal = async () => {
    setSalvandoTotal(true)
    await atualizarDescontoFrete(pedido.id, desconto, frete)
    setEditandoTotal(false)
    setSalvandoTotal(false)
    router.refresh()
  }

  const cancelarInfo = () => {
    setInfoDepositoId(pedido.deposito_id ?? '')
    setInfoFormaId(pedido.forma_pagamento_id ?? '')
    setInfoOrigem(pedido.origem ?? 'balcao')
    setEditandoInfo(false)
  }

  const handleSalvarInfo = async () => {
    setSalvandoInfo(true)
    const res = await atualizarInfoPedido(pedido.id, {
      deposito_id: infoDepositoId || null,
      forma_pagamento_id: infoFormaId || null,
      origem: infoOrigem || null,
    })
    if (!res?.error) {
      setEditandoInfo(false)
      router.refresh()
    }
    setSalvandoInfo(false)
  }

  const [busca, setBusca] = useState('')
  const [produtoSel, setProdutoSel] = useState<Produto | null>(null)
  const [quantidade, setQuantidade] = useState('1')
  const [precoUnit, setPrecoUnit] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [erroAdd, setErroAdd] = useState('')

  const sugestoes = useMemo(() => {
    const q = busca.toLowerCase().trim()
    if (!q || produtoSel) return []
    return produtos.filter(p => p.nome.toLowerCase().includes(q)).slice(0, 8)
  }, [busca, produtos, produtoSel])

  const selecionarProduto = (p: Produto) => {
    setProdutoSel(p)
    setBusca(p.nome)
    // Usa preço da tabela se disponível, senão preço padrão
    const preco = precoTabela[p.id] ?? p.preco
    setPrecoUnit(preco?.toString() ?? '')
  }

  const handleAdicionar = async () => {
    if (!produtoSel || !precoUnit) return
    setAdicionando(true)
    setErroAdd('')
    const fd = new FormData()
    fd.set('produto_id', produtoSel.id)
    fd.set('quantidade', quantidade || '1')
    fd.set('preco_unitario', precoUnit)
    const res = await adicionarItemPedido(pedido.id, fd)
    if (res?.error) {
      setErroAdd(res.error)
    } else {
      setBusca(''); setProdutoSel(null); setQuantidade('1'); setPrecoUnit('')
      router.refresh()
    }
    setAdicionando(false)
  }

  const handleRemover = (itemId: string) => {
    setItens(prev => prev.filter(i => i.id !== itemId))
    startTransition(async () => {
      await removerItemPedido(itemId, pedido.id)
      router.refresh()
    })
  }

  const handleStatus = (novoStatus: string) => {
    startTransition(async () => {
      await atualizarStatusPedido(pedido.id, novoStatus)
      router.refresh()
    })
  }

  // Observações / Termos
  const [obsAberto, setObsAberto] = useState(!!(pedido.observacoes || pedido.termos_condicoes || pedido.motivo_cancelamento))
  const [editandoObs, setEditandoObs] = useState(false)
  const [obsTexto, setObsTexto] = useState(pedido.observacoes ?? '')
  const [termosTexto, setTermosTexto] = useState(pedido.termos_condicoes ?? '')
  const [salvandoObs, setSalvandoObs] = useState(false)

  const handleSalvarObs = async () => {
    setSalvandoObs(true)
    await atualizarObservacoesTermos(pedido.id, {
      observacoes: obsTexto || null,
      termos_condicoes: termosTexto || null,
    })
    setEditandoObs(false)
    setSalvandoObs(false)
    router.refresh()
  }

  // Cancelar com motivo
  const [modalCancelar, setModalCancelar] = useState(false)
  const [motivoCancelar, setMotivoCancelar] = useState('')
  const [cancelando, setCancelando] = useState(false)

  const handleCancelarComMotivo = async () => {
    setCancelando(true)
    await cancelarComMotivo(pedido.id, motivoCancelar)
    setModalCancelar(false)
    setCancelando(false)
    router.refresh()
  }

  const [faturando, setFaturando] = useState(false)
  const [msgFaturar, setMsgFaturar] = useState<{ ok: boolean; texto: string } | null>(null)

  const handleFaturar = async () => {
    if (!confirm('Faturar este pedido? Isso cria a venda e baixa o estoque.')) return
    setFaturando(true); setMsgFaturar(null)
    const res = await faturarPedido(pedido.id)
    setFaturando(false)
    setMsgFaturar({ ok: res.ok, texto: res.ok ? `✓ ${res.msg}${res.vendaNumero ? ` (Venda #${res.vendaNumero})` : ''}` : `✗ ${res.msg}` })
    if (res.ok) router.refresh()
  }

  const [gerandoOS, setGerandoOS] = useState(false)
  const [erroOS, setErroOS] = useState('')

  const handleGerarOS = async () => {
    if (!confirm('Gerar Ordem de Serviço a partir deste pedido?')) return
    setGerandoOS(true); setErroOS('')
    const res = await gerarOSDePedido(pedido.id)
    if (res?.error) { setErroOS(res.error); setGerandoOS(false) }
    // redirect acontece dentro da action
  }

  const podeEditar = pedido.status === 'rascunho'
  const subtotal = itens.reduce((s, i) => s + (i.total_item ?? 0), 0)
  const totalAtual = Math.max(0, subtotal - desconto + frete)
  const temTabela = Object.keys(precoTabela).length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">
              {pedido.tipo === 'orcamento' ? 'Orçamento' : 'Pedido'} #{pedido.numero ?? '—'}
            </h2>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[pedido.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {STATUS_LABEL[pedido.status] ?? pedido.status}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            {pedido.pessoa_nome ?? 'Sem cliente'} · {fmtDate(pedido.created_at)}
            {pedido.data_validade && ` · Válido até ${formatDate(pedido.data_validade)}`}
            {pedido.referencia_cliente && ` · Ref: ${pedido.referencia_cliente}`}
          </p>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {pedido.status === 'rascunho' && (
            <button onClick={() => handleStatus('aprovado')}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
              Aprovar
            </button>
          )}
          {(pedido.status === 'rascunho' || pedido.status === 'aprovado' || pedido.status === 'pendente') && itens.length > 0 && (
            <>
              <button onClick={handleFaturar} disabled={faturando}
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition">
                {faturando ? 'Faturando...' : '💰 Faturar'}
              </button>
              <a href={`/painel/pdv?pedido=${pedido.id}`}
                className="rounded-xl border border-green-200 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 transition">
                Abrir no PDV
              </a>
            </>
          )}
          <button onClick={handleGerarOS} disabled={gerandoOS}
            className="rounded-xl border border-purple-200 px-4 py-2 text-sm font-semibold text-purple-600 hover:bg-purple-50 disabled:opacity-50 transition">
            {gerandoOS ? 'Gerando...' : '🔧 Gerar OS'}
          </button>
          {pedido.status !== 'cancelado' && pedido.status !== 'faturado' && (
            <button onClick={() => setModalCancelar(true)}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 transition">
              Cancelar
            </button>
          )}
          {erroOS && <p className="text-xs text-red-500">{erroOS}</p>}
        </div>
      </div>
      {msgFaturar && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${msgFaturar.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {msgFaturar.texto}
        </div>
      )}

      {/* Info cards */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {editandoInfo ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-400">Depósito</label>
                <select
                  value={infoDepositoId ?? ''}
                  onChange={(e) => setInfoDepositoId(e.target.value)}
                  className="field w-full">
                  <option value="">— Nenhum —</option>
                  {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-400">Pagamento</label>
                <select
                  value={infoFormaId ?? ''}
                  onChange={(e) => setInfoFormaId(e.target.value)}
                  className="field w-full">
                  <option value="">— A definir —</option>
                  {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-400">Origem</label>
                <select value={infoOrigem} onChange={(e) => setInfoOrigem(e.target.value)} className="field w-full">
                  {Object.entries(ORIGEM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSalvarInfo} disabled={salvandoInfo}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
                {salvandoInfo ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={cancelarInfo}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
              {[
                { label: 'VENDEDOR',  valor: pedido.vendedor_nome },
                { label: 'DEPÓSITO',  valor: depositos.find(d => d.id === infoDepositoId)?.nome ?? pedido.deposito_nome },
                { label: 'PAGAMENTO', valor: formas.find(f => f.id === infoFormaId)?.nome ?? pedido.forma_pagamento_nome },
                { label: 'ORIGEM',    valor: ORIGEM_LABEL[infoOrigem] ?? infoOrigem },
              ].map(({ label, valor }) => (
                <div key={label}>
                  <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{valor ?? <span className="text-gray-300">—</span>}</p>
                </div>
              ))}
            </div>
            {podeEditar && (
              <button onClick={() => setEditandoInfo(true)}
                className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition">
                Editar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Adicionar produto */}
      {podeEditar && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Adicionar Produto</h3>
            {temTabela && (
              <span className="text-xs text-blue-600 bg-blue-50 rounded-full px-2.5 py-1 font-medium">
                Preços da tabela selecionada
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="relative flex-1 min-w-56">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Produto</label>
              <input
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setProdutoSel(null) }}
                className="field w-full"
                placeholder="Digite o nome do produto..."
              />
              {sugestoes.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {sugestoes.map(p => {
                    const precoTb = precoTabela[p.id]
                    return (
                      <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); selecionarProduto(p) }}
                        className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-blue-50 text-left text-sm">
                        <span className="font-medium text-gray-800">{p.nome}</span>
                        <span className="text-xs ml-2 text-right">
                          {precoTb != null ? (
                            <span className="text-blue-600 font-semibold">{fmt(precoTb)}</span>
                          ) : (
                            <span className="text-gray-400">{fmt(p.preco ?? 0)}</span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="w-24">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Qtd</label>
              <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
                type="number" step="1" min="1" className="field w-full" />
            </div>
            <div className="w-36">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço Unit.</label>
              <input value={precoUnit} onChange={(e) => setPrecoUnit(e.target.value)}
                type="number" step="0.01" min="0" className="field w-full" placeholder="0,00" />
            </div>
            <button onClick={handleAdicionar} disabled={!produtoSel || !precoUnit || adicionando}
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
              {adicionando ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
          {erroAdd && <p className="text-sm text-red-600">{erroAdd}</p>}
        </div>
      )}

      {/* Tabela de itens */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qtd</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Unit.</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
              {podeEditar && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {itens.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                Nenhum item adicionado.
              </td></tr>
            ) : itens.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 group">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{item.produtos?.nome ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{item.quantidade}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{fmt(item.preco_unitario ?? 0)}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(item.total_item ?? 0)}</td>
                {podeEditar && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleRemover(item.id)}
                      className="text-xs text-red-400 hover:text-red-600 font-medium opacity-0 group-hover:opacity-100 transition">
                      Remover
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {itens.length > 0 && (
            <tfoot className="bg-gray-50 border-t border-gray-100">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-sm text-gray-500 text-right">Subtotal</td>
                <td className="px-4 py-2 text-sm text-gray-700 text-right">{fmt(subtotal)}</td>
                {podeEditar && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Totais — desconto e frete */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Resumo</p>
          {podeEditar && !editandoTotal && (
            <button onClick={() => setEditandoTotal(true)}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 transition">
              Editar
            </button>
          )}
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span><span>{fmt(subtotal)}</span>
          </div>
          {editandoTotal ? (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-500 w-24 shrink-0">Desconto (R$)</label>
                <input type="number" step="0.01" min="0" value={desconto}
                  onChange={e => setDesconto(parseFloat(e.target.value) || 0)}
                  className="field flex-1 text-right" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-500 w-24 shrink-0">Frete (R$)</label>
                <input type="number" step="0.01" min="0" value={frete}
                  onChange={e => setFrete(parseFloat(e.target.value) || 0)}
                  className="field flex-1 text-right" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSalvarTotal} disabled={salvandoTotal}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
                  {salvandoTotal ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={() => { setDesconto(pedido.desconto); setFrete(pedido.frete); setEditandoTotal(false) }}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              {desconto > 0 && (
                <div className="flex justify-between text-sm text-red-500">
                  <span>Desconto</span><span>- {fmt(desconto)}</span>
                </div>
              )}
              {frete > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Frete</span><span>+ {fmt(frete)}</span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between pt-2 border-t border-gray-100">
            <span className="text-sm font-bold text-gray-900">Total</span>
            <span className="text-base font-bold text-gray-900">{fmt(totalAtual)}</span>
          </div>
        </div>
      </div>

      {/* Observações / Termos / Motivo Cancelamento */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setObsAberto(!obsAberto)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
          <span>Observações / Termos e Condições{pedido.motivo_cancelamento ? ' / Motivo Cancelamento' : ''}</span>
          <svg className={`h-4 w-4 text-gray-400 transition-transform ${obsAberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {obsAberto && (
          <div className="border-t border-gray-100 px-4 py-4 space-y-4">
            {editandoObs ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">Observações Gerais</label>
                  <textarea
                    value={obsTexto}
                    onChange={e => setObsTexto(e.target.value)}
                    rows={4}
                    placeholder="Observações internas ou para o cliente..."
                    className="field w-full resize-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">Termos e Condições de Venda</label>
                  <textarea
                    value={termosTexto}
                    onChange={e => setTermosTexto(e.target.value)}
                    rows={6}
                    placeholder="Termos e condições para este pedido/orçamento..."
                    className="field w-full resize-none text-sm" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSalvarObs} disabled={salvandoObs}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
                    {salvandoObs ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setObsTexto(pedido.observacoes ?? ''); setTermosTexto(pedido.termos_condicoes ?? ''); setEditandoObs(false) }}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-4">
                    {obsTexto ? (
                      <div>
                        <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Observações Gerais</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{obsTexto}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Nenhuma observação.</p>
                    )}
                    {termosTexto && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Termos e Condições</p>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{termosTexto}</p>
                      </div>
                    )}
                  </div>
                  {podeEditar && (
                    <button onClick={() => setEditandoObs(true)}
                      className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition">
                      Editar
                    </button>
                  )}
                </div>
                {pedido.motivo_cancelamento && (
                  <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-red-400 mb-1">Motivo do Cancelamento</p>
                    <p className="text-sm text-red-700">{pedido.motivo_cancelamento}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Cancelar com Motivo */}
      {modalCancelar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalCancelar(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Cancelar {pedido.tipo === 'orcamento' ? 'orçamento' : 'pedido'}?</h3>
            <p className="text-sm text-gray-400 mb-4">Esta ação não pode ser desfeita.</p>
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">Motivo (opcional)</label>
              <textarea
                value={motivoCancelar}
                onChange={e => setMotivoCancelar(e.target.value)}
                rows={3}
                placeholder="Ex: Cliente desistiu, produto fora de estoque..."
                className="field w-full resize-none text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModalCancelar(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Voltar
              </button>
              <button onClick={handleCancelarComMotivo} disabled={cancelando}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition">
                {cancelando ? 'Cancelando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
