'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL, formatDate } from '@/lib/utils'
import type { DadosPedidosApp, PedidoAppAtendimento } from '@/lib/pedidos-app'
import { carregarPedidosApp, confirmarPedidoApp, faturarPedidoApp, cancelarPedidoApp } from './actions'

export function PedidosAppClient({ dados: iniciais }: { dados: DadosPedidosApp }) {
  const [dados, setDados] = useState(iniciais)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const emCurso = useRef(false)
  const [depositos, setDepositos] = useState<Record<string, string>>({})
  const [formas, setFormas] = useState<Record<string, string>>({})
  const [recebidos, setRecebidos] = useState<Record<string, boolean>>({})
  const [revisao, setRevisao] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('abertos')
  const unidade = dados.unidade?.unidade

  async function executar(acao: (token: string) => Promise<void>) {
    if (emCurso.current) return
    emCurso.current = true; setOcupado(true); setErro(''); setMensagem('')
    try {
      const { data } = await createClient().auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sessão expirada. Entre novamente.')
      await acao(token)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir. Seus dados foram mantidos.') }
    finally { emCurso.current = false; setOcupado(false) }
  }
  async function atualizar(token: string) { setDados(await carregarPedidosApp(unidade, token)) }
  function confirmar(pedido: PedidoAppAtendimento) {
    if (!unidade) return
    void executar(async token => {
      const r = await confirmarPedidoApp(pedido.id, unidade, token)
      if ('erro' in r) throw new Error(r.erro)
      await atualizar(token); setMensagem('Disponibilidade confirmada nesta unidade. O pagamento continua pendente.')
    })
  }
  function finalizar(pedido: PedidoAppAtendimento) {
    if (!unidade) return
    void executar(async token => {
      const r = await faturarPedidoApp(pedido.id, unidade, depositos[pedido.id] ?? '', formas[pedido.id] ?? '', recebidos[pedido.id] === true, token)
      if ('erro' in r) throw new Error(r.erro)
      setRevisao(null)
      setDados(prev => ({ ...prev, pedidos: prev.pedidos.map(p => p.id === pedido.id ? { ...p, vendaId: r.vendaId } : p) }))
      setMensagem(`Venda ${r.vendaNumero ?? r.vendaId.slice(0, 8)} registrada nesta unidade.`)
      // A venda já está confirmada; falha de refresh não reabre o botão de faturar.
      try { await atualizar(token) } catch { setErro('Venda registrada. Não foi possível atualizar os estados; use Atualizar pedidos.') }
    })
  }
  function cancelar(pedido: PedidoAppAtendimento) {
    if (!unidade || !window.confirm('Cancelar o pedido completo, incluindo todas as unidades? Essa ação não estorna vendas já registradas.')) return
    void executar(async token => {
      const r = await cancelarPedidoApp(pedido.id, unidade, token)
      if ('erro' in r) throw new Error(r.erro)
      setRevisao(null); await atualizar(token); setMensagem('Pedido cancelado. Nenhuma venda ou estorno foi criado.')
    })
  }
  const pedidos = dados.pedidos.filter(p => filtro === 'todos' || (!p.vendaId && p.status !== 'cancelado'))
  const controles = 'min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50'
  return <div className="space-y-6">
    <div><h2 className="text-2xl font-bold text-gray-900">Pedidos do App</h2>
      <p className="mt-1 text-sm text-gray-500">Confira as peças da unidade e registre a venda após confirmar disponibilidade e pagamento.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-48 flex-1 text-sm text-gray-700">Unidade
        <select aria-label="Unidade" className={controles} value={unidade ?? ''} disabled={ocupado || !dados.unidades.length}
          onChange={e => { const nova = e.target.value; void executar(async token => { setDados(await carregarPedidosApp(nova, token)); setRevisao(null); setDepositos({}); setFormas({}); setRecebidos({}) }) }}>
          {!dados.unidades.length && <option value="">Nenhuma unidade configurada</option>}
          {dados.unidades.map(u => <option key={u.unidade} value={u.unidade}>{u.nome}</option>)}
        </select></label>
      <label className="min-w-40 flex-1 text-sm text-gray-700">Mostrar
        <select aria-label="Mostrar pedidos" className={controles} value={filtro} disabled={ocupado} onChange={e => setFiltro(e.target.value)}>
          <option value="abertos">Aguardando atendimento</option><option value="todos">Todos os recentes</option>
        </select></label>
      <button className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm disabled:opacity-50" disabled={ocupado || !unidade}
        onClick={() => { void executar(atualizar) }}>{ocupado ? 'Aguarde…' : 'Atualizar pedidos'}</button>
    </div>
    {erro && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</p>}
    {mensagem && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{mensagem}</p>}
    {!dados.unidade && <p className="rounded-xl border bg-white p-6 text-sm text-gray-600">Nenhuma unidade está configurada para seu acesso. Peça ao administrador para conferir o vínculo da unidade.</p>}
    {dados.unidade && !pedidos.length && <p className="rounded-xl border bg-white p-6 text-sm text-gray-600">Nenhum pedido neste filtro. Confira a unidade ou atualize a lista.</p>}
    {pedidos.map(p => {
      const forma = dados.formas.find(f => f.id === formas[p.id])
      const pendente = forma?.tipo === 'fiado'
      const pronto = !!depositos[p.id] && !!forma && (pendente || recebidos[p.id] === true)
      return <article key={p.id} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold text-gray-900">Pedido {p.id.slice(0, 8)}</h3>
          <p className="break-words text-sm text-gray-600">{p.cliente} · {formatDate(p.criadoEm)}</p></div>
          <span className="text-sm text-gray-600">{p.vendaId ? 'Venda registrada' : p.status === 'cancelado' ? 'Cancelado' : p.confirmado ? 'Disponibilidade confirmada' : 'Aguardando conferência'}</span></div>
        <ul className="divide-y divide-gray-100">{p.itens.map(i => <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
          <span className="min-w-0 break-words">{i.quantidade} × {i.nome}</span><span className="shrink-0">{formatBRL(i.preco * i.quantidade)}</span>
        </li>)}</ul>
        <p className="font-semibold text-gray-900">Total nesta unidade: {formatBRL(p.total)}</p>
        {p.vendaId ? <div className="text-sm text-gray-600"><p>Venda: {p.vendaId.slice(0, 8)}</p><p>Pagamento do pedido completo: {p.pagamento}</p></div>
          : p.status !== 'cancelado' && <>
            {!p.confirmado ? <button className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm text-white disabled:opacity-50" disabled={ocupado} onClick={() => confirmar(p)}>Confirmar disponibilidade</button>
              : <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-gray-700">Depósito de saída<select aria-label={`Depósito do pedido ${p.id.slice(0, 8)}`} className={controles} value={depositos[p.id] ?? ''} disabled={ocupado}
                    onChange={e => { setDepositos(prev => ({ ...prev, [p.id]: e.target.value })); setRevisao(null) }}>
                    <option value="">Selecione o depósito</option>{dados.depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select></label>
                  <label className="text-sm text-gray-700">Pagamento<select aria-label={`Pagamento do pedido ${p.id.slice(0, 8)}`} className={controles} value={formas[p.id] ?? ''} disabled={ocupado}
                    onChange={e => { setFormas(prev => ({ ...prev, [p.id]: e.target.value })); setRecebidos(prev => ({ ...prev, [p.id]: false })); setRevisao(null) }}>
                    <option value="">Selecione a forma</option>{dados.formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select></label>
                </div>
                {forma && (pendente ? <p className="text-sm text-amber-800">Pagamento ficará pendente, sujeito à autorização de crédito do cliente.</p>
                  : <label className="flex min-h-11 items-center gap-3 text-sm text-gray-700"><input type="checkbox" className="h-5 w-5" disabled={ocupado}
                    checked={recebidos[p.id] === true} onChange={e => { setRecebidos(prev => ({ ...prev, [p.id]: e.target.checked })); setRevisao(null) }} />Conferi o recebimento de {formatBRL(p.total)}. Um comprovante sozinho não confirma o pagamento.</label>)}
                {revisao === p.id ? <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm text-blue-900">Registrar {formatBRL(p.total)} em {dados.unidade?.nome}, depósito {dados.depositos.find(d => d.id === depositos[p.id])?.nome}, com {forma?.nome} {pendente ? '(pendente)' : '(recebido)'}?</p>
                  <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm text-white disabled:opacity-50" disabled={ocupado || !pronto} onClick={() => finalizar(p)}>Confirmar venda</button>
                    <button className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm" disabled={ocupado} onClick={() => setRevisao(null)}>Modificar</button></div>
                </div> : <button className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm text-white disabled:opacity-50" disabled={ocupado || !pronto} onClick={() => setRevisao(p.id)}>Revisar venda</button>}
              </div>}
            <button className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 disabled:opacity-50" disabled={ocupado} onClick={() => cancelar(p)}>Cancelar pedido completo</button>
          </>}
      </article>
    })}
    <p className="text-xs text-gray-500">Até 100 pedidos recentes por unidade. Um pedido de duas unidades é atendido separadamente em cada loja.</p>
  </div>
}
