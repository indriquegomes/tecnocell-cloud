'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { hojeSP } from '@/lib/utils'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { buscarDetalheVendaPublic, cancelarVenda, type DetalheVendaCompleto } from './actions'
import { MOTIVOS_CANCELAMENTO, motivoCancelamento } from '@/lib/motivos'
import { ResumoMotivos } from '@/components/ResumoMotivos'
import { Dica } from '@/components/Dica'

type Venda = {
  id: string
  numero: number | null
  total: number
  desconto: number
  created_at: string
  status: string
  vendedor_nome: string | null
  pessoa_nome: string | null
  forma_pagamento_nome: string | null
  loja: string
  motivo_cancelamento?: string | null
  observacoes?: string | null
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

const STATUS: Record<string, { label: string; cor: string }> = {
  concluida: { label: 'Concluída',   cor: 'bg-green-50 text-green-700 border-green-200' },
  cancelada:  { label: 'Cancelada',  cor: 'bg-red-50 text-red-600 border-red-200' },
  aberta:     { label: 'Em aberto',  cor: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
}

function BadgeStatus({ status, motivo }: { status: string; motivo?: string | null }) {
  const s = STATUS[status] ?? { label: status, cor: 'bg-gray-100 text-gray-500 border-gray-200' }
  // POR QUE foi cancelada — antes o motivo era gravado e nunca aparecia em lugar nenhum
  const m = status === 'cancelada' ? motivoCancelamento(motivo) : null
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cor}`}>
        {s.label}
      </span>
      {m && (
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${m.cor}`}>
          {m.icone} {m.label}
        </span>
      )}
    </div>
  )
}

export function VendasClient({
  vendas,
  totalGeral,
  totalDesconto,
  ticketMedio,
  canceladas,
  formas,
  lojas,
  vendedores,
  filtros,
}: {
  vendas: Venda[]
  totalGeral: number
  totalDesconto: number
  ticketMedio: number
  canceladas: number
  formas: { id: string; nome: string }[]
  lojas: string[]
  vendedores: string[]
  filtros: { de: string; ate: string; busca: string; forma: string; status: string; loja: string; vendedor: string }
}) {
  const router = useRouter()

  // Cancelar venda (feature nova): devolve estoque/IMEI, tira do financeiro,
  // estorna o crédito. A venda vira 'cancelada' e some dos totais, sem perder o rastro.
  const [confCancelar, setConfCancelar] = useState(false)
  const [motivoCancel, setMotivoCancel] = useState('')
  const [motivoTipo, setMotivoTipo] = useState('')   // motivo FECHADO — sem ele nao cancela
  const [cancelando, setCancelando] = useState(false)
  const [erroCancel, setErroCancel] = useState('')

  const handleCancelar = async (vendaId: string) => {
    setCancelando(true); setErroCancel('')
    const r = await cancelarVenda(vendaId, motivoCancel, motivoTipo)
    setCancelando(false)
    if (!r.ok) { setErroCancel(r.erro); return }
    setConfCancelar(false); setMotivoCancel(''); setDetalhe(null)
    router.refresh()
  }
  const [, startTransition] = useTransition()

  const [de, setDe] = useState(filtros.de)
  const [ate, setAte] = useState(filtros.ate)
  const [busca, setBusca] = useState(filtros.busca)
  const [forma, setForma] = useState(filtros.forma)
  const [status, setStatus] = useState(filtros.status)
  const [loja, setLoja] = useState(filtros.loja)
  const [vendedor, setVendedor] = useState(filtros.vendedor)

  const [detalhe, setDetalhe] = useState<DetalheVendaCompleto | null>(null)
  const [carregando, setCarregando] = useState(false)

  const aplicarFiltros = useCallback(() => {
    const p = new URLSearchParams()
    if (de) p.set('de', de)
    if (ate) p.set('ate', ate)
    if (busca) p.set('busca', busca)
    if (forma) p.set('forma', forma)
    if (status) p.set('status', status)
    if (loja) p.set('loja', loja)
    if (vendedor) p.set('vendedor', vendedor)
    startTransition(() => router.push(`/painel/vendas?${p.toString()}`))
  }, [de, ate, busca, forma, status, loja, vendedor, router])

  const abrirDetalhe = async (id: string) => {
    setCarregando(true)
    setDetalhe(null)
    const d = await buscarDetalheVendaPublic(id)
    setDetalhe(d)
    setCarregando(false)
  }

  // Deep-link: /painel/vendas?venda=<id> já abre a venda. É o que o botão da
  // conferência do caixa usa — clicou na venda lá, cai aqui com ela aberta.
  const searchParams = useSearchParams()
  const vendaLink = searchParams.get('venda')
  useEffect(() => {
    if (vendaLink) abrirDetalhe(vendaLink)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendaLink])

  const concluidas = vendas.filter(v => v.status === 'concluida').length

  // POR QUE as vendas foram canceladas. Em julho, 76% dos cancelamentos tinham uma
  // venda pro MESMO cliente no MESMO dia (cheira a erro de digitação sendo refeito) —
  // mas isso era DEDUÇÃO. Com o motivo preenchido, aqui fica a resposta de verdade.
  const [filtroMotivo, setFiltroMotivo] = useState<string | null>(null)

  const listaCanceladas = vendas.filter((v) => v.status === 'cancelada')
  const contagemMotivos = listaCanceladas.reduce((acc, v) => {
    const k = v.motivo_cancelamento ?? '__sem__'
    acc[k] ??= { n: 0, valor: 0 }
    acc[k].n += 1
    acc[k].valor += v.total
    return acc
  }, {} as Record<string, { n: number; valor: number }>)

  const vendasVisiveis = filtroMotivo
    ? vendas.filter((v) => v.status === 'cancelada' && (v.motivo_cancelamento ?? '__sem__') === filtroMotivo)
    : vendas

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Vendas</p>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Painel de Vendas</h2>
          <Dica texto="Lista de todas as vendas realizadas. Clique em uma venda para ver os detalhes, produtos e forma de pagamento." />
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total do período', valor: fmt(totalGeral), cor: 'text-green-600' },
          { label: `${concluidas} venda${concluidas !== 1 ? 's' : ''}`, valor: fmt(ticketMedio), sub: 'ticket médio', cor: 'text-blue-600' },
          { label: 'Descontos concedidos', valor: fmt(totalDesconto), cor: 'text-orange-500' },
          { label: canceladas > 0 ? `${canceladas} cancelada${canceladas !== 1 ? 's' : ''}` : 'Sem cancelamentos', valor: fmt(totalGeral - totalDesconto), sub: 'líquido', cor: 'text-gray-900' },
        ].map(({ label, valor, sub, cor }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${cor}`}>{valor}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">De</label>
            <input type="date" value={de} onChange={e => setDe(e.target.value)}
              className="field" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">Até</label>
            <input type="date" value={ate} onChange={e => setAte(e.target.value)}
              className="field" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs font-semibold text-gray-400 uppercase">Busca (cliente, vendedor, nº)</label>
            <input type="text" placeholder="Ex: João, Vitor, 42..." value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aplicarFiltros()}
              className="field" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">Pagamento</label>
            <select value={forma} onChange={e => setForma(e.target.value)} className="field">
              <option value="">Todas</option>
              {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="field">
              <option value="">Todos</option>
              <option value="concluida">Concluídas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
          {lojas.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-400 uppercase">Loja</label>
              <select value={loja} onChange={e => setLoja(e.target.value)} className="field">
                <option value="">Todas</option>
                {lojas.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          {vendedores.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-400 uppercase">Vendedor</label>
              <select value={vendedor} onChange={e => setVendedor(e.target.value)} className="field">
                <option value="">Todos</option>
                {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          )}
          <button onClick={aplicarFiltros}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 transition">
            Filtrar
          </button>
          <button onClick={() => {
            const ini = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
            const hj = hojeSP()
            setDe(ini); setAte(hj); setBusca(''); setForma(''); setStatus(''); setLoja(''); setVendedor('')
            startTransition(() => router.push('/painel/vendas'))
          }} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition">
            Limpar
          </button>
        </div>
      </div>

      {/* Por que as vendas foram canceladas — cada barra filtra a lista */}
      {listaCanceladas.length > 0 && (
        <ResumoMotivos
          titulo="Por que as vendas foram canceladas"
          motivos={MOTIVOS_CANCELAMENTO}
          contagem={contagemMotivos}
          selecionado={filtroMotivo}
          onSelecionar={setFiltroMotivo}
          legenda="Clique numa barra pra ver só os cancelamentos daquele motivo."
        />
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-50 text-sm">
            <thead>
              <tr className="bg-gray-50/80 text-left">
                {['Nº', 'Data / Hora', 'Status', 'Cliente', 'Vendedor', 'Loja', 'Pagamento', 'Desconto', 'Total', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vendasVisiveis.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <p className="text-2xl mb-2">🛒</p>
                    <p className="text-sm text-gray-400">Nenhuma venda no período.</p>
                  </td>
                </tr>
              ) : vendasVisiveis.map(v => (
                <tr key={v.id} className="hover:bg-blue-50/60/60 transition group cursor-pointer" onClick={() => abrirDetalhe(v.id)}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                      #{String(v.numero ?? '—').padStart(4, '0')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtData(v.created_at)}</td>
                  <td className="px-4 py-3"><BadgeStatus status={v.status} motivo={v.motivo_cancelamento} /></td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-[140px] truncate">
                    {v.pessoa_nome ?? <span className="text-gray-300 font-normal italic text-xs">Cliente final</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">
                    {v.vendedor_nome ?? <span className="text-gray-300 italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {v.loja || <span className="text-gray-300 italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {v.forma_pagamento_nome ?? <span className="text-gray-300 italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-orange-500 whitespace-nowrap">
                    {v.desconto > 0 ? `-${fmt(v.desconto)}` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{fmt(v.total)}</td>
                  <td className="px-3 py-3 opacity-0 group-hover:opacity-100 transition">
                    <span className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500">Ver</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {vendas.length > 0 && (
              <tfoot className="border-t border-gray-100 bg-gray-50/80">
                <tr>
                  <td colSpan={6} className="px-4 py-2 text-xs text-gray-400">{vendas.length} registro{vendas.length !== 1 ? 's' : ''}</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-orange-500">
                    {totalDesconto > 0 ? `-${fmt(totalDesconto)}` : ''}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">{fmt(totalGeral)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal detalhe */}
      {(detalhe || carregando) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { setDetalhe(null); setCarregando(false) }}>
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {detalhe ? `Venda #${String(detalhe.numero ?? '—').padStart(4, '0')}` : 'Carregando...'}
                </h3>
                {detalhe && <p className="text-xs text-gray-400 mt-0.5">{fmtData(detalhe.created_at)}</p>}
              </div>
              <div className="flex items-center gap-2">
                {detalhe && <BadgeStatus status={detalhe.status} />}
                <button onClick={() => { setDetalhe(null); setCarregando(false) }}
                  className="ml-2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
              </div>
            </div>

            {carregando && !detalhe ? (
              <p className="py-14 text-center text-sm text-gray-400">Carregando...</p>
            ) : detalhe ? (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Vendedor', valor: detalhe.vendedor_nome ?? '—' },
                    { label: 'Cliente', valor: detalhe.pessoa_nome ?? 'Cliente final', href: detalhe.pessoa_id ? `/painel/clientes/${detalhe.pessoa_id}/editar` : null },
                  ].map(({ label, valor, href }: { label: string; valor: string; href?: string | null }) => (
                    <div key={label}>
                      <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
                      {href ? (
                        <Link href={href} className="mt-0.5 block text-blue-600 hover:underline">{valor}</Link>
                      ) : (
                        <p className="text-gray-800 mt-0.5">{valor}</p>
                      )}
                    </div>
                  ))}
                </div>

                {detalhe.observacoes && (
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Observações</p>
                    <p className="text-sm text-gray-600">{detalhe.observacoes}</p>
                  </div>
                )}

                {/* Itens */}
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Itens</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-xs font-semibold uppercase text-gray-400">
                          <th className="px-3 py-2 text-left">Produto</th>
                          <th className="px-3 py-2 text-right">Qtd</th>
                          <th className="px-3 py-2 text-right">Unit.</th>
                          <th className="px-3 py-2 text-right">Desc.</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {detalhe.itens.map((i, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2">
                              <Link href={`/painel/produtos/${i.produto_id}/editar`}
                                className="text-gray-800 hover:text-blue-600 hover:underline transition">
                                {i.nome}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">{i.quantidade}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{fmt(i.preco_unitario)}</td>
                            <td className="px-3 py-2 text-right text-orange-400">
                              {i.desconto_item > 0 ? `-${fmt(i.desconto_item)}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(i.total_item)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagamentos */}
                {detalhe.pagamentos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Pagamentos</p>
                    <div className="space-y-1.5">
                      {detalhe.pagamentos.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{p.forma_nome}</span>
                            {p.parcelas > 1 && (
                              <span className="ml-2 text-xs text-gray-400">{p.parcelas}x</span>
                            )}
                            {p.maquina && (
                              <span className="ml-2 text-xs text-gray-400">· {p.maquina}</span>
                            )}
                          </div>
                          <span className="text-sm font-bold text-gray-900">{fmt(p.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total */}
                <div className="border-t border-gray-100 pt-3 space-y-1">
                  {detalhe.desconto > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Desconto total</span>
                      <span className="text-orange-500 font-medium">-{fmt(detalhe.desconto)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-gray-900">
                    <span>Total</span>
                    <span>{fmt(detalhe.total)}</span>
                  </div>
                </div>

                {/* Ações da venda — o modal era só leitura; agora leva pra onde precisa */}
                <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
                  {detalhe.status !== 'cancelada' && (
                    <Link href={`/painel/devolucoes?venda=${detalhe.id}`}
                      className="rounded-xl border border-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                      Devolver produto
                    </Link>
                  )}
                  {detalhe.pessoa_nome && (
                    <Link href={`/painel/vendas?busca=${encodeURIComponent(detalhe.pessoa_nome)}`}
                      className="rounded-xl border border-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                      Compras deste cliente
                    </Link>
                  )}
                </div>

                {/* Cancelar venda — devolve estoque/IMEI, tira do financeiro e estorna
                    o crédito usado. A venda fica no histórico como 'cancelada'. */}
                {detalhe.status !== 'cancelada' && (() => {
                  // Dinheiro que ENTROU de verdade: fiado é dívida (não entrou) e
                  // vale sai do saldo do cliente (o cancelamento já estorna sozinho).
                  const recebidos = detalhe.pagamentos.filter(
                    (p) => p.status === 'pago' && p.tipo !== 'fiado' && p.tipo !== 'vale_credito',
                  )
                  const comoDevolver = (p: typeof recebidos[number]) =>
                    p.tipo === 'dinheiro' ? 'devolver da gaveta'
                    : p.tipo === 'pix' ? 'fazer o PIX de volta'
                    : p.tipo === 'cartao_debito' || p.tipo === 'cartao_credito'
                      ? `estornar na maquininha${p.maquina ? ' ' + p.maquina : ''}`
                      : 'devolver ao cliente'

                  // Já recebeu dinheiro → cancelar é o caminho errado (não devolve
                  // nada). Em vez de deixar clicar e tomar erro, a tela já explica
                  // e manda pra Devolução, que sabe tirar do lugar certo.
                  if (recebidos.length > 0) {
                    return (
                      <div className="border-t border-gray-100 pt-3">
                        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <p className="text-xs font-semibold text-amber-800">Esta venda não pode ser cancelada — ela já recebeu dinheiro.</p>
                          <ul className="space-y-0.5">
                            {recebidos.map((p, i) => (
                              <li key={i} className="text-xs text-amber-800">
                                • <b>{fmt(p.valor)}</b> em {p.forma_nome} → precisa {comoDevolver(p)}
                              </li>
                            ))}
                          </ul>
                          <p className="text-xs text-amber-700">
                            Cancelar <b>não devolve</b> esse dinheiro — ele ficaria solto e o caixa fecharia com sobra.
                            Use <b>Devolução</b>, que tira do lugar certo. Se na verdade nada foi pago, faça a Devolução
                            escolhendo <b>&quot;sem reembolso&quot;</b>.
                          </p>
                          <Link href={`/painel/devolucoes?venda=${detalhe.id}`}
                            className="block rounded-xl bg-amber-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-amber-700 transition">
                            Ir para Devolução
                          </Link>
                        </div>
                      </div>
                    )
                  }

                  return (
                  <div className="border-t border-gray-100 pt-3">
                    {!confCancelar ? (
                      <button type="button" onClick={() => setConfCancelar(true)}
                        className="w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition">
                        Cancelar esta venda
                      </button>
                    ) : (
                      <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                        <p className="text-xs text-red-700">
                          Isso devolve o estoque, tira os lançamentos do financeiro e estorna o crédito usado.
                          A venda fica no histórico como <b>cancelada</b> (não some).
                        </p>
                        {/* Motivo FECHADO e obrigatorio. Em julho 76% dos cancelamentos
                            tem uma venda pro mesmo cliente no mesmo dia (cheira a erro de
                            digitacao sendo refeito) — mas isso e deducao. So o motivo prova. */}
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase text-red-700">Por que está cancelando? *</p>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {MOTIVOS_CANCELAMENTO.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => setMotivoTipo(m.id)}
                                className={`rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                                  motivoTipo === m.id ? `${m.cor} font-semibold ring-1 ring-inset` : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                }`}
                              >
                                <span className="mr-1">{m.icone}</span>{m.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          value={motivoCancel}
                          onChange={(e) => setMotivoCancel(e.target.value)}
                          placeholder={motivoTipo === 'outro' ? 'Escreva o motivo…' : 'Detalhe (opcional)'}
                          className="field"
                        />
                        {erroCancel && <p className="text-xs font-medium text-red-700">{erroCancel}</p>}
                        <div className="flex gap-2">
                          <button type="button"
                            disabled={cancelando || !motivoTipo || (motivoTipo === 'outro' && !motivoCancel.trim())}
                            onClick={() => handleCancelar(detalhe.id)}
                            className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition">
                            {cancelando ? 'Cancelando…' : !motivoTipo ? 'Escolha o motivo acima' : 'Confirmar cancelamento'}
                          </button>
                          <button type="button" disabled={cancelando} onClick={() => { setConfCancelar(false); setErroCancel(''); setMotivoCancel(''); setMotivoTipo('') }}
                            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                            Voltar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })()}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
