'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL, formatDate } from '@/lib/utils'
import type { DadosPedidosApp, PedidoAppAtendimento } from '@/lib/pedidos-app'
import { carregarPedidosApp, confirmarPedidoApp, cancelarPedidoApp } from './actions'

export function PedidosAppClient({ dados: iniciais }: { dados: DadosPedidosApp }) {
  const [dados, setDados] = useState(iniciais)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [filtro, setFiltro] = useState('abertos')
  const [aberto, setAberto] = useState<string | null>(null)
  const emCurso = useRef(false)
  const unidade = dados.unidade?.unidade
  async function executar(acao: (token: string) => Promise<void>) {
    if (emCurso.current) return
    emCurso.current = true; setOcupado(true); setErro(''); setMensagem('')
    try {
      const { data } = await createClient().auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sessão expirada. Entre novamente.')
      await acao(token)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.') }
    finally { emCurso.current = false; setOcupado(false) }
  }
  async function atualizar(token: string, novaUnidade = unidade) {
    setDados(await carregarPedidosApp(novaUnidade, token))
  }
  function confirmar(pedido: PedidoAppAtendimento) {
    if (!unidade) return
    void executar(async token => {
      const result = await confirmarPedidoApp(pedido.id, unidade, token)
      if ('erro' in result) throw new Error(result.erro)
      setDados(prev => ({ ...prev, pedidos: prev.pedidos.map(p => p.id === pedido.id ? { ...p, confirmado: true } : p) }))
      setMensagem('Disponibilidade confirmada nesta unidade. O pagamento não foi alterado.')
      try { await atualizar(token) } catch { setErro('Confirmação registrada. Não foi possível atualizar a lista; tente Atualizar pedidos.') }
    })
  }
  function cancelar(pedido: PedidoAppAtendimento) {
    if (!unidade || !window.confirm('Cancelar este pedido inteiro, incluindo as outras unidades? Não haverá venda, cobrança ou estorno.')) return
    void executar(async token => {
      const result = await cancelarPedidoApp(pedido.id, unidade, token)
      if ('erro' in result) throw new Error(result.erro)
      setDados(prev => ({ ...prev, pedidos: prev.pedidos.map(p => p.id === pedido.id ? { ...p, status: 'cancelado' } : p) }))
      setMensagem('Pedido cancelado. Nenhum pagamento foi alterado.')
      try { await atualizar(token) } catch { setErro('Cancelamento registrado. Não foi possível atualizar a lista; tente Atualizar pedidos.') }
    })
  }
  const pedidos = dados.pedidos.filter(p => filtro === 'todos' || (p.status !== 'cancelado' && !p.confirmado))
  const controles = 'min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50'
  return <div className="space-y-5">
    <div><h2 className="text-2xl font-bold text-gray-900">Pedidos do App</h2>
      <p className="mt-1 text-sm text-gray-500">Confira as peças e confirme a disponibilidade na sua unidade.</p></div>
    {!dados.gerenciamentoHabilitado && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Somente consulta. O atendimento será liberado após a validação da integração.</p>}
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-48 flex-1 text-sm text-gray-700">Unidade
        <select aria-label="Unidade" className={controles} value={unidade ?? ''} disabled={ocupado || !dados.unidades.length}
          onChange={e => { const nova = e.target.value; void executar(async token => { await atualizar(token, nova); setAberto(null) }) }}>
          {!dados.unidades.length && <option value="">Nenhuma unidade configurada</option>}
          {dados.unidades.map(u => <option key={u.unidade} value={u.unidade}>{u.nome}</option>)}
        </select></label>
      <label className="min-w-40 flex-1 text-sm text-gray-700">Mostrar
        <select aria-label="Mostrar pedidos" className={controles} value={filtro} disabled={ocupado} onChange={e => setFiltro(e.target.value)}>
          <option value="abertos">Aguardando atendimento</option><option value="todos">Todos os recentes</option>
        </select></label>
      <button className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm disabled:opacity-50" disabled={ocupado || !unidade}
        onClick={() => { void executar(token => atualizar(token)) }}>{ocupado ? 'Aguarde…' : 'Atualizar pedidos'}</button>
    </div>
    {erro && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</p>}
    {mensagem && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{mensagem}</p>}
    {!dados.unidade && <p className="rounded-xl border bg-white p-6 text-sm text-gray-600">Nenhuma unidade está configurada para seu acesso. Peça ao administrador para conferir o vínculo da unidade.</p>}
    {dados.unidade && !pedidos.length && <p className="rounded-xl border bg-white p-6 text-sm text-gray-600">Nenhum pedido neste filtro.</p>}
    {dados.maisPedidos && <p className="text-sm text-gray-500">Há mais pedidos nesta unidade. Carregue os anteriores para continuar a consulta.</p>}
    <div className="space-y-3">{pedidos.map(p => <section key={p.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0"><p className="break-words font-semibold text-gray-900">{p.cliente}</p>
          <p className="text-xs text-gray-500">Pedido {p.id.slice(0, 8)} · {formatDate(p.criadoEm)}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2 py-1 ${p.status === 'cancelado' ? 'bg-gray-100 text-gray-700' : p.confirmado ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{p.status === 'cancelado' ? 'Cancelado' : p.confirmado ? 'Confirmado nesta unidade' : 'Aguardando confirmação'}</span>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-800">{p.pagamento === 'pago' ? 'Pagamento confirmado' : p.pagamento === 'cancelado' ? 'Pagamento cancelado' : 'Pagamento pendente'}</span>
          </div></div>
        <p className="font-semibold text-gray-900">{formatBRL(p.total)}</p>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-3">
        <button aria-expanded={aberto === p.id} className="min-h-11 rounded-lg border border-gray-300 px-3 text-sm" onClick={() => setAberto(aberto === p.id ? null : p.id)}>{aberto === p.id ? 'Fechar peças' : 'Ver peças'}</button>
        <button disabled={ocupado || !dados.gerenciamentoHabilitado || p.confirmado || p.status === 'cancelado'} onClick={() => confirmar(p)} className="min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-50">Confirmar disponibilidade</button>
        <button disabled={ocupado || !dados.gerenciamentoHabilitado || p.status === 'cancelado' || p.pagamento !== 'pendente'} onClick={() => cancelar(p)} className="min-h-11 rounded-lg px-3 text-sm text-red-700 disabled:opacity-50">Cancelar pedido</button>
      </div>
      {aberto === p.id && <ul aria-label="Peças do pedido" className="space-y-3 border-t border-gray-100 bg-gray-50 p-4 text-sm">{p.itens.map(i => <li key={i.id} className="flex justify-between gap-4"><span className="min-w-0 break-words">{i.quantidade}× {i.nome}</span><span className="shrink-0">{formatBRL(i.preco * i.quantidade)}</span></li>)}</ul>}
    </section>)}</div>
    {dados.proximoCursor && <button disabled={ocupado} className={controles} onClick={() => { void executar(async token => {
      const proxima = await carregarPedidosApp(unidade, token, dados.proximoCursor!)
      setDados(prev => ({ ...proxima, pedidos: [...prev.pedidos, ...proxima.pedidos.filter(p => !prev.pedidos.some(atual => atual.id === p.id))] }))
    }) }}>Carregar pedidos anteriores</button>}
  </div>
}
