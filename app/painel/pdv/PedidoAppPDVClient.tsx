'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL } from '@/lib/utils'
import { carregarPedidoAppPDV, finalizarPedidoAppPDV, type PagamentoPedidoApp } from '../pedidos-app/actions'
import { buscarCupomVenda, type CupomSnap } from './actions'

type Pedido = Awaited<ReturnType<typeof carregarPedidoAppPDV>>
type Forma = { id: string; nome: string; tipo: string; loja_id: string | null; maquina_id: string | null }
type Deposito = { id: string; nome: string; loja_id: string | null }
type Maquina = { id: string; nome: string; taxa_debito: number; taxas_credito: number[]; max_parcelas: number }
type Linha = { id: number; forma: string; valor: string; maquina: string; parcelas: number }

export function PedidoAppPDVClient({ id, unidade, formas, depositos, maquinas }: {
  id: string; unidade: string; formas: Forma[]; depositos: Deposito[]; maquinas: Maquina[]
}) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [deposito, setDeposito] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([{ id: 1, forma: '', valor: '', maquina: '', parcelas: 1 }])
  const [series, setSeries] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [cupom, setCupom] = useState<CupomSnap | null>(null)
  const vendaId = useRef<string | null>(null)
  const envio = useRef(false)
  const token = async () => (await createClient().auth.getSession()).data.session?.access_token ?? null

  async function atualizar() {
    const accessToken = await token()
    if (!accessToken) throw new Error('Sessão expirada. Entre novamente.')
    const atual = await carregarPedidoAppPDV(id, unidade, accessToken)
    setPedido(atual)
    vendaId.current = atual.vendaId
    if (atual.vendaId) setCupom(await buscarCupomVenda(accessToken, atual.vendaId))
  }
  useEffect(() => { void atualizar().catch(e => setErro(e instanceof Error ? e.message : 'Pedido indisponível.')) }, [id, unidade])

  const disponiveis = formas.filter(f => !f.loja_id || f.loja_id === pedido?.lojaId)
    .filter(f => f.tipo !== 'vale_credito')
  const depositosLoja = depositos.filter(d => d.loja_id === pedido?.lojaId)
  const valor = (l: Linha) => Number(l.valor.replace(',', '.')) || 0
  const soma = linhas.reduce((s, l) => s + valor(l), 0)
  const falta = Math.round(((pedido?.total ?? 0) - soma) * 100) / 100
  const troco = falta < 0 && linhas.some(l => disponiveis.find(f => f.id === l.forma)?.tipo === 'dinheiro') ? -falta : 0
  const atualizarLinha = (idLinha: number, patch: Partial<Linha>) =>
    setLinhas(prev => prev.map(l => l.id === idLinha ? { ...l, ...patch } : l))

  async function imprimir() {
    if (!vendaId.current) return
    try {
      const accessToken = await token()
      if (!accessToken) throw new Error('Sessão expirada.')
      const novo = await buscarCupomVenda(accessToken, vendaId.current)
      if (!novo) throw new Error('Cupom da venda não encontrado.')
      setCupom(novo)
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir o cupom.') }
  }

  async function concluir() {
    if (!pedido || envio.current || vendaId.current) return
    setErro('')
    if (!deposito || !depositosLoja.some(d => d.id === deposito)) { setErro('Selecione um depósito da unidade.'); return }
    if (falta > 0.01 || (falta < -0.01 && (troco === 0 || troco > linhas.reduce((s,l) =>
      s + (disponiveis.find(f => f.id === l.forma)?.tipo === 'dinheiro' ? valor(l) : 0),0)))) {
      setErro('Os pagamentos precisam fechar com o valor original do pedido.'); return
    }
    const pagamentos: PagamentoPedidoApp[] = []
    let trocoRestante = troco
    for (const l of linhas) {
      const f = disponiveis.find(f => f.id === l.forma)
      if (!f || valor(l) <= 0) { setErro('Confira todas as formas e valores.'); return }
      if (f.tipo === 'fiado' && !pedido.permiteFiado) { setErro('Cliente sem fiado liberado.'); return }
      const maquina = maquinas.find(m => m.id === (f.maquina_id || l.maquina))
      const cartao = f.tipo === 'cartao_credito' || f.tipo === 'cartao_debito'
      if (cartao && !maquina) { setErro('Selecione a máquina do cartão.'); return }
      const taxaPct = !cartao ? 0 : f.tipo === 'cartao_debito' ? maquina!.taxa_debito : maquina!.taxas_credito[l.parcelas - 1] ?? 0
      const devolvido = f.tipo === 'dinheiro' ? Math.min(valor(l),trocoRestante) : 0
      trocoRestante -= devolvido
      if (valor(l) - devolvido <= 0) continue
      pagamentos.push({ forma_pagamento_id: f.id, valor: valor(l) - devolvido, taxa: Math.round(valor(l) * taxaPct) / 100,
        maquina: cartao ? maquina!.nome : '', parcelas: cartao ? l.parcelas : 1, status: f.tipo === 'fiado' ? 'pendente' : 'pago' })
    }
    const imeis = pedido.itens.filter(i => i.serializado).flatMap(i => Array.from({ length: i.quantidade }, (_, n) => ({
      produto_id: i.id, serie: (series[`${i.id}:${n}`] ?? '').trim(),
    })))
    if (imeis.some(s => !s.serie)) { setErro('Informe todos os IMEIs das peças serializadas.'); return }
    envio.current = true; setOcupado(true)
    try {
      const accessToken = await token()
      if (!accessToken) throw new Error('Sessão expirada. Entre novamente.')
      const result = await finalizarPedidoAppPDV(id, unidade, deposito, pagamentos, imeis, accessToken)
      if ('erro' in result) {
        await atualizar()
        if (vendaId.current) { await imprimir(); return }
        throw new Error(result.erro)
      }
      vendaId.current = result.vendaId
      await atualizar()
      await imprimir()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Resposta incerta. Atualize antes de repetir.') }
    finally { envio.current = false; setOcupado(false) }
  }

  return <main className="mx-auto max-w-3xl space-y-5 p-4 text-gray-900">
    <div className="print:hidden"><a href="/painel/pedidos-app" className="text-sm text-blue-700">← Pedidos do App</a>
      <h1 className="mt-2 text-2xl font-bold">Atender no PDV</h1>
      <p className="text-sm text-gray-600">Origem: Aplicativo · Pedido {id} · {unidade}</p></div>
    {erro && <p role="alert" className="print:hidden rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{erro}</p>}
    {!pedido && !erro && <p role="status">Conferindo pedido e vínculo do cliente…</p>}
    {pedido && <section className="print:hidden rounded-xl border bg-white p-5">
      <h2 className="font-semibold">{pedido.cliente}</h2>
      <p className="text-sm text-gray-500">Peças e preços originais do pedido</p>
      <ul className="my-4 divide-y">{pedido.itens.map(i => <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
        <span>{i.quantidade}× {i.nome}</span><strong>{formatBRL(i.quantidade * i.preco)}</strong>
      </li>)}</ul>
      <p className="text-right text-xl font-bold">Total {formatBRL(pedido.total)}</p>
      {pedido.vendaId ? <div className={`mt-5 rounded-lg p-4 ${pedido.vendaCancelada ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-900'}`}>
        <p>{pedido.vendaCancelada ? 'Venda cancelada no PDV. Confira o histórico antes de qualquer novo atendimento.' : 'Venda já lançada. Não conclua novamente.'}</p>
        {!pedido.vendaCancelada && <button onClick={() => void imprimir()} className="mt-3 rounded-lg bg-green-700 px-4 py-2 text-white">Reimprimir cupom</button>}
      </div> : <div className="mt-5 space-y-4">
        <label className="block text-sm font-medium">Depósito
          <select value={deposito} onChange={e => setDeposito(e.target.value)} className="mt-1 w-full rounded-lg border p-3">
            <option value="">Selecione</option>{depositosLoja.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select></label>
        {pedido.itens.filter(i => i.serializado).flatMap(i => Array.from({ length: i.quantidade }, (_, n) =>
          <label key={`${i.id}:${n}`} className="block text-sm font-medium">IMEI de {i.nome} ({n + 1})
            <input value={series[`${i.id}:${n}`] ?? ''} onChange={e => setSeries(prev => ({ ...prev, [`${i.id}:${n}`]: e.target.value }))}
              className="mt-1 w-full rounded-lg border p-3" /></label>))}
        <h3 className="font-semibold">Pagamento</h3>
        {linhas.map(l => { const f = disponiveis.find(x => x.id === l.forma); const cartao = f?.tipo === 'cartao_credito' || f?.tipo === 'cartao_debito'
          return <div key={l.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
            <select aria-label="Forma de pagamento" value={l.forma} onChange={e => atualizarLinha(l.id, { forma: e.target.value, maquina: '', parcelas: 1 })} className="rounded-lg border p-3">
              <option value="">Forma de pagamento</option>{disponiveis.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            <input aria-label="Valor do pagamento" inputMode="decimal" placeholder="Valor" value={l.valor}
              onChange={e => atualizarLinha(l.id, { valor: e.target.value })} className="rounded-lg border p-3" />
            {cartao && <><select aria-label="Máquina de cartão" value={f?.maquina_id || l.maquina} disabled={!!f?.maquina_id}
              onChange={e => atualizarLinha(l.id, { maquina: e.target.value })} className="rounded-lg border p-3">
              <option value="">Máquina</option>{maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
              {f?.tipo === 'cartao_credito' && <select aria-label="Parcelas" value={l.parcelas} onChange={e => atualizarLinha(l.id, { parcelas: Number(e.target.value) })} className="rounded-lg border p-3">
                {Array.from({ length: maquinas.find(m => m.id === (f.maquina_id || l.maquina))?.max_parcelas ?? 1 }, (_, n) => <option key={n} value={n + 1}>{n + 1}x</option>)}</select>}</>}
            {linhas.length > 1 && <button onClick={() => setLinhas(prev => prev.filter(x => x.id !== l.id))} className="text-left text-sm text-red-700">Remover forma</button>}
          </div> })}
        <button onClick={() => setLinhas(prev => [...prev, { id: Date.now(), forma: '', valor: '', maquina: '', parcelas: 1 }])} className="text-sm text-blue-700">+ Outra forma</button>
        <p className="text-sm">{falta > 0 ? 'Falta' : troco > 0 ? 'Troco' : 'Total fechado'}: {formatBRL(falta > 0 ? falta : troco)}</p>
        <button disabled={ocupado} onClick={() => void concluir()} className="w-full rounded-lg bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">{ocupado ? 'Concluindo…' : 'Concluir e imprimir'}</button>
        <p className="text-xs text-gray-500">A venda só é aceita após sucesso do servidor. Fechar a impressão não desfaz a venda.</p>
      </div>}
    </section>}
    {cupom && pedido?.vendaId && <section className="hidden print:block print:w-[80mm] print:font-mono print:text-xs">
      <style>{'@media print { @page { size: 80mm auto; margin: 3mm; } body { margin: 0; } }'}</style>
      <p className="text-center font-bold">{cupom.loja ?? 'Tecnocell'}</p>
      <p>Origem: Aplicativo · Pedido {id}</p><p>Venda #{cupom.numero ?? '—'} · {cupom.horario}</p>
      <p>Cliente: {cupom.cliente ?? pedido.cliente}</p><hr />
      {cupom.itens.map((i,n) => <p key={n}>{i.quantidade}× {i.codigo ? `${i.codigo} · ` : ''}{i.nome} — {formatBRL(i.quantidade * i.preco_unitario)}</p>)}
      <hr /><p>Total: {formatBRL(pedido.total + cupom.pagamentos.reduce((s,p) => s + p.taxa, 0))}</p>
      {cupom.pagamentos.map((p,n) => <p key={n}>{p.forma_nome}: {formatBRL(p.valor + p.taxa)} {p.status === 'pendente' ? '(A receber)' : ''}</p>)}
      <p className="mt-4 text-center">Pedido do App · comprovante do PDV</p>
    </section>}
  </main>
}
