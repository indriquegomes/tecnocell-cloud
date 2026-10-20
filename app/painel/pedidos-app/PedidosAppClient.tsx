'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL, formatDate } from '@/lib/utils'
import type { DadosPedidosApp, PedidoAppAtendimento } from '@/lib/pedidos-app'
import { carregarPedidosApp, confirmarPedidoApp, cancelarPedidoApp, encaminharPedidoAppPDV, registrarOperacaoPedidoApp } from './actions'

export function PedidosAppClient({ dados: iniciais, pedidoId }: { dados: DadosPedidosApp; pedidoId?: string }) {
  const [dados, setDados] = useState(iniciais)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [aberto, setAberto] = useState<string | null>(pedidoId ?? null)
  const emCurso = useRef(false)
  const leituraEmCurso = useRef(false)
  const [verificadoEm, setVerificadoEm] = useState<string | null>(null)
  const [som, setSom] = useState(false)
  const audio = useRef<AudioContext | null>(null)
  const conhecidos = useRef(new Set(iniciais.pedidos.map(p => p.id)))
  const unidade = dados.unidade?.unidade
  useEffect(() => {
    conhecidos.current = new Set(dados.pedidos.map(p => p.id))
    setVerificadoEm(null)
    // Não alertar pedidos antigos ao trocar de unidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade])
  useEffect(() => {
    if (!unidade || pedidoId || dados.pedidos.length > 100) return
    const atualizarVisivel = () => {
      if (document.visibilityState === 'visible' && !emCurso.current && !leituraEmCurso.current) {
        void executar(token => atualizar(token))
      }
    }
    const timer = window.setInterval(atualizarVisivel, 20000)
    document.addEventListener('visibilitychange', atualizarVisivel)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', atualizarVisivel) }
    // Recriar com o estado da unidade/paginação evita fechar sobre dados antigos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, pedidoId, som])
  useEffect(() => () => { void audio.current?.close() }, [])
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
    if (leituraEmCurso.current) throw new Error('A consulta anterior ainda está em andamento. Aguarde ou recarregue a página.')
    leituraEmCurso.current = true
    const consulta = carregarPedidosApp(novaUnidade, token, undefined, novaUnidade === unidade ? pedidoId : undefined)
    void consulta.then(() => { leituraEmCurso.current = false }, () => { leituraEmCurso.current = false })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const novos = await Promise.race([consulta, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('A consulta demorou. Os dados exibidos podem estar antigos. Tente novamente.')), 15000)
      })])
      const chegou = novaUnidade === unidade && novos.pedidos.some(p => !conhecidos.current.has(p.id) && p.status !== 'cancelado' && !p.vendaId)
      if (chegou && som && audio.current) {
        const contexto = audio.current
        const oscilador = contexto.createOscillator(), volume = contexto.createGain()
        volume.gain.value = 0.08; oscilador.connect(volume); volume.connect(contexto.destination)
        oscilador.start(); oscilador.stop(contexto.currentTime + 0.18)
      }
      novos.pedidos.forEach(p => conhecidos.current.add(p.id))
      setDados(novos)
      setVerificadoEm(new Date().toLocaleTimeString('pt-BR'))
    } finally { clearTimeout(timer) }
  }
  function registrar(pedido: PedidoAppAtendimento, tipo: string) {
    if (!unidade) return
    if (tipo === 'transferir' && !window.confirm('Assumir este pedido no lugar do responsável atual? A troca ficará registrada.')) return
    if (tipo === 'entregue' && !window.confirm('Confirma que as peças foram entregues e que a condição de pagamento foi conferida na loja?')) return
    void executar(async token => {
      const result = await registrarOperacaoPedidoApp(pedido.id, unidade, pedido.operacao?.versao ?? 0, tipo, token)
      if ('erro' in result) throw new Error(result.erro)
      setMensagem('Etapa registrada. Confira o andamento atualizado abaixo.')
      await atualizar(token)
    })
  }
  function confirmar(pedido: PedidoAppAtendimento) {
    if (!unidade) return
    void executar(async token => {
      const result = await confirmarPedidoApp(pedido.id, unidade, token)
      if ('erro' in result) throw new Error(result.erro)
      setDados(prev => ({ ...prev, pedidos: prev.pedidos.map(p => p.id === pedido.id ? { ...p, confirmado: true } : p) }))
      setFiltro('todos'); setAberto(pedido.id)
      setMensagem('Pedido aceito nesta unidade. Você já pode imprimir a ficha. O pagamento não foi alterado.')
      try { await atualizar(token) } catch { setErro('Confirmação registrada. Não foi possível atualizar a lista; tente Atualizar pedidos.') }
    })
  }
  function abrirNoPDV(pedido: PedidoAppAtendimento) {
    if (!unidade) return
    if (pedido.vendaId) {
      window.location.assign(`/painel/pdv?${new URLSearchParams({ pedidoApp: pedido.id, unidade })}`)
      return
    }
    void executar(async token => {
      const result = await encaminharPedidoAppPDV(pedido.id, unidade, token)
      if ('erro' in result) throw new Error(result.erro)
      window.location.assign(result.url)
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
      {pedidoId && <a href="/painel/pedidos-app" className="text-sm text-blue-700 underline">Ver lista de pedidos</a>}
      <p className="mt-1 text-sm text-gray-500">Confira as peças e atenda o pedido no PDV para escolher o pagamento.</p></div>
    <div className="rounded-xl border bg-white p-3 text-sm">
      <p>{dados.pedidos.filter(p => p.status !== 'cancelado' && !p.vendaId && !p.operacao?.responsavelId).length} pedido(s) sem responsável nesta lista · {verificadoEm ? `Última conferência: ${verificadoEm}` : 'Lista carregada ao abrir; aguardando nova conferência.'}</p>
      <p>{pedidoId || dados.pedidos.length > 100 ? 'Atualização automática pausada nesta consulta; use Atualizar pedidos para conferir os recentes.' : 'Atualização a cada 20 segundos com esta aba visível.'} Mantenha a fila aberta; o aviso não acompanha o WhatsApp em outra aba.</p>
      <button className="min-h-11 underline" onClick={() => {
        if (!som) {
          try { audio.current ??= new AudioContext(); void audio.current.resume() } catch { setErro('Som indisponível neste navegador. Acompanhe o contador.'); return }
        }
        setSom(!som)
      }}>{som ? 'Desativar aviso sonoro' : 'Ativar aviso sonoro'}</button>
    </div>
    {!dados.gerenciamentoHabilitado && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Somente consulta. O atendimento será liberado após a validação da integração.</p>}
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-48 flex-1 text-sm text-gray-700">Unidade
        <select aria-label="Unidade" className={controles} value={unidade ?? ''} disabled={ocupado || !!pedidoId || !dados.unidades.length}
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
          <p className="break-all text-xs text-gray-500">Pedido {p.id} · {formatDate(p.criadoEm)}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2 py-1 ${p.status === 'cancelado' || p.vendaCancelada ? 'bg-gray-100 text-gray-700' : p.vendaId ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{p.vendaCancelada ? 'Venda cancelada no PDV' : p.status === 'cancelado' ? 'Cancelado' : p.vendaId ? 'Lançado no PDV' : p.encaminhado ? 'Em atendimento' : p.confirmado ? 'Disponibilidade confirmada' : 'Aguardando atendimento'}</span>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-800">{p.pagamento === 'pago' ? 'Pagamento confirmado' : p.pagamento === 'cancelado' ? 'Pagamento cancelado' : 'Pagamento pendente'}</span>
          </div></div>
        <p className="font-semibold text-gray-900">{formatBRL(p.total)}</p>
      </div>
      {dados.operacaoHabilitada && <div className="space-y-2 border-t bg-slate-50 p-4 text-sm">
        <p>Responsável: {p.operacao?.responsavel ?? (p.operacao?.responsavelId ? 'Operador da loja' : 'Ninguém assumiu')}{p.operacao?.responsavelEm ? ` desde ${formatDate(p.operacao.responsavelEm)}` : ''}</p>
        <p>Solicitações de impressão registradas: {p.operacao?.solicitacoesImpressao ?? 0}. Este registro é manual e não comprova que o papel saiu.</p>
        <p>{p.operacao?.entregueEm ? 'Entrega registrada' : p.operacao?.separadoEm ? 'Peças separadas; aguardando entrega' : 'Separação não confirmada'} · {p.operacao?.papelConfirmadoEm ? 'Papel confirmado pelo operador' : 'Papel ainda não confirmado'}</p>
        <p>{p.vendaId ? 'Venda vinculada — consulte o pagamento no PDV.' : 'Ainda não virou venda.'} Ficha não comprova pagamento. Crédito Loja continua a receber até a quitação.</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={ocupado || p.status === 'cancelado' || !!p.operacao?.entregueEm} className={controles} onClick={() => registrar(p, p.operacao?.responsavelId ? 'transferir' : 'assumir')}>{p.operacao?.responsavelId ? 'Assumir / transferir para mim' : 'Assumir atendimento'}</button>
          {p.operacao?.responsavelId && !p.operacao.entregueEm && p.status !== 'cancelado' && <>
            <button disabled={ocupado} className={controles} onClick={() => registrar(p, 'impressao_solicitada')}>Registrar solicitação de impressão</button>
            <button disabled={ocupado} className={controles} onClick={() => registrar(p, 'papel_confirmado')}>Confirmar que o papel saiu</button>
            <button disabled={ocupado || !!p.operacao.separadoEm} className={controles} onClick={() => registrar(p, 'separado')}>Confirmar peças separadas</button>
            <button disabled={ocupado || !p.vendaId || p.vendaCancelada || !p.operacao.separadoEm} className={controles} onClick={() => registrar(p, 'entregue')}>Confirmar entrega ao cliente</button>
          </>}
        </div>
      </div>}
      <div className="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-3">
        <button aria-expanded={aberto === p.id} className="min-h-11 rounded-lg border border-gray-300 px-3 text-sm" onClick={() => setAberto(aberto === p.id ? null : p.id)}>{aberto === p.id ? 'Ocultar detalhes' : 'Ver pedido'}</button>
        {dados.pdvHabilitado ? <button disabled={ocupado || (p.status === 'cancelado' && !p.vendaId)} onClick={() => abrirNoPDV(p)} className="min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-50">{p.vendaCancelada ? 'Ver venda cancelada' : p.vendaId ? 'Ver venda e reimprimir' : 'Atender no PDV'}</button> : <>
          <button disabled={ocupado || !dados.gerenciamentoHabilitado || p.confirmado || p.status === 'cancelado'} onClick={() => confirmar(p)} className="min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-50">Confirmar disponibilidade</button>
          {p.confirmado && p.status !== 'cancelado' && <a target="_blank" rel="noopener noreferrer" href={`/painel/pedidos-app/imprimir?${new URLSearchParams({ pedido: p.id, unidade: unidade! })}`} className="flex min-h-11 items-center rounded-lg border border-gray-300 px-3 text-sm">Imprimir ficha sem pagamento</a>}
        </>}
        <button disabled={ocupado || !dados.gerenciamentoHabilitado || p.status === 'cancelado' || p.pagamento !== 'pendente' || !!p.vendaId} onClick={() => cancelar(p)} className="min-h-11 rounded-lg px-3 text-sm text-red-700 disabled:opacity-50">Cancelar pedido</button>
      </div>
      {aberto === p.id && <ul aria-label="Peças do pedido" className="space-y-3 border-t border-gray-100 bg-gray-50 p-4 text-sm">{p.itens.map(i => <li key={i.id} className="flex justify-between gap-4"><span className="min-w-0 break-words">{i.quantidade}× {i.nome}</span><span className="shrink-0">{formatBRL(i.preco * i.quantidade)}</span></li>)}</ul>}
    </section>)}</div>
    {dados.proximoCursor && <button disabled={ocupado} className={controles} onClick={() => { void executar(async token => {
      const proxima = await carregarPedidosApp(unidade, token, dados.proximoCursor!)
      setDados(prev => ({ ...proxima, pedidos: [...prev.pedidos, ...proxima.pedidos.filter(p => !prev.pedidos.some(atual => atual.id === p.id))] }))
    }) }}>Carregar pedidos anteriores</button>}
  </div>
}
