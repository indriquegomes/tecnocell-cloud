'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL } from '@/lib/utils'
import StorePrizes from './StorePrizes'

type Store = { id: string; name: string; total: number; pending: number; unlocked_at: string | null; unlocked_margin: number | null }
type Product = { product_id: string; name: string; store_id: string; quantity: number; revenue: number; cost: number | null; margin: number | null }
type Sale = { sale_id: string; number: number; store_id: string; store_name: string; created_at: string; status: string; quantity: number; revenue: number; cost: number | null; margin: number | null; pending: boolean }
type State = { stores: Store[]; products: Product[]; sales: Sale[]; last_sync_at: string | null; sync_error: string | null }
type Filters = { campaign: string; store: string; from: string; to: string; product: string }
const initial: Filters = { campaign: 'halloween-2026', store: '', from: '', to: '', product: '' }
const field = 'w-full rounded-lg border border-purple-300 bg-white p-2 text-gray-900'
const money = (value: number | null) => value == null ? 'Custo pendente' : formatBRL(value)
const date = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const status = (value: string) => ({ concluida: 'Concluída', paid: 'Quitada', pago: 'Quitada', quitada: 'Quitada', pending: 'Pagamento pendente', pendente: 'Pagamento pendente', cancelled: 'Cancelada', canceled: 'Cancelada', cancelada: 'Cancelada', refunded: 'Devolvida', devolvida: 'Devolvida', partially_refunded: 'Devolução parcial' }[value] ?? value)

export default function HalloweenProfit() {
 const [client] = useState(createClient)
 const [filters, setFilters] = useState<Filters>(initial)
 const [state, setState] = useState<State | null>(null)
 const [stores, setStores] = useState<Store[]>([])
 const [products, setProducts] = useState<{ id: string; name: string }[]>([])
 const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
 const filtersRef = useRef(filters), requestRef = useRef(0)
 filtersRef.current = filters
 function change(key: keyof Filters, value: string) {
  const next = key === 'campaign' ? { ...initial, campaign: value } : { ...filtersRef.current, [key]: value }
  // Invalidate synchronously, before an older request can settle between renders.
  filtersRef.current = next; requestRef.current++; setFilters(next); setState(null); setMessage(''); setBusy(false)
  if (key === 'campaign') { setStores([]); setProducts([]) }
 }
 async function refresh() {
  const selected = filtersRef.current, request = ++requestRef.current
  if (selected.from && selected.to && selected.from > selected.to) { setMessage('A data inicial deve ser anterior ou igual à data final.'); return }
  setBusy(true); setMessage('')
  try {
   const { data, error } = await client.rpc('halloween_margin_state', { p_campaign: selected.campaign, p_store: selected.store || null, p_from: selected.from || null, p_to: selected.to || null, p_product: selected.product || null })
   if (request !== requestRef.current) return
   if (error) throw new Error(['PGRST202', '42883'].includes(error.code) ? 'A apuração automática ainda não está disponível neste ambiente. A função de consulta precisa ser instalada antes de usar este painel.' : error.message)
   const next = data as State
   setState(next)
   setStores(previous => { const all = new Map(previous.map(s => [s.id, s])); next.stores.forEach(s => all.set(s.id, s)); return [...all.values()] })
   setProducts(previous => { const all = new Map(previous.map(p => [p.id, p])); next.products.forEach(p => all.set(p.product_id, { id: p.product_id, name: p.name })); return [...all.values()] })
  } catch (error) {
   if (request === requestRef.current) { setState(null); setMessage(error instanceof Error ? error.message : 'Não foi possível consultar a apuração. Tente atualizar novamente.') }
  } finally { if (request === requestRef.current) setBusy(false) }
 }
 useEffect(() => {
  let loaded = false
  const load = () => { if (document.hidden || loaded) return; loaded = true; void refresh() }
  load(); document.addEventListener('visibilitychange', load)
  return () => { requestRef.current++; document.removeEventListener('visibilitychange', load) }
  // Each filter change starts one request; there is no background polling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [filters])
 const storeName = (id: string) => stores.find(s => s.id === id)?.name ?? id
 return <div className="max-w-7xl space-y-6">
  <div><h2 className="text-2xl font-bold text-purple-900">Halloween · margem por loja</h2><p className="mt-2 text-gray-600">Consulta interna da equipe. Selecione Halloween na venda no PDV; a apuração é automática após a quitação. Qualquer cliente pode participar, sem vale obrigatório.</p></div>
  <div className="rounded-xl border border-purple-200 bg-purple-50 p-5 space-y-4">
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    <label>Campanha<select className={field} value={filters.campaign} onChange={e => change('campaign', e.target.value)}><option value="halloween-2026">Halloween 2026 — real</option><option value="halloween-2026-test">Homologação — sem valor real</option></select></label>
    <label>Loja<select className={field} value={filters.store} onChange={e => change('store', e.target.value)}><option value="">Todas as lojas</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label>Data inicial<input className={field} type="date" value={filters.from} onChange={e => change('from', e.target.value)}/></label>
    <label>Data final<input className={field} type="date" value={filters.to} onChange={e => change('to', e.target.value)}/></label>
    <label>Produto<select className={field} value={filters.product} onChange={e => change('product', e.target.value)}><option value="">Todos os produtos</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   </div>
   <button className="rounded-lg bg-purple-800 px-4 py-2 text-white disabled:opacity-40" disabled={busy} onClick={() => void refresh()}>{busy ? 'Consultando…' : 'Atualizar apuração'}</button>
   <p className="text-sm">Margem bruta = receita após desconto − custo dos produtos. Não desconta taxas, impostos ou despesas. Cada loja libera seus raros ao atingir R$700 de margem na campanha. A liberação é permanente, mesmo após devoluções.</p>
   <p className="text-sm">Datas e produto filtram os relatórios abaixo; não alteram o acumulado nem a liberação da loja.</p>
  </div>
  {message && <p role="alert" className="rounded-lg bg-orange-100 p-4">{message}</p>}
  {state && <><div className="grid gap-4 sm:grid-cols-2">{state.stores.map(s => <section key={s.id} className="rounded-xl border p-5 space-y-2"><h3 className="font-bold text-lg">{s.name}</h3><p>Margem acumulada na campanha</p><p className="text-3xl font-bold">{formatBRL(s.total)}</p><progress aria-label={`Progresso de ${s.name}`} className="w-full" max={700} value={Math.min(700, Math.max(0, s.total))}/>{s.unlocked_at ? <><p className="font-semibold text-green-800">Liberado permanentemente</p><p>Liberação em {date(s.unlocked_at)} · margem no momento: {s.unlocked_margin == null ? 'não informada' : formatBRL(s.unlocked_margin)}</p></> : s.total >= 700 && s.pending > 0 ? <p>Meta atingida · resolva as pendências para liberar os brindes.</p> : <p>Raros bloqueados · faltam {formatBRL(Math.max(0, 700 - s.total))}.</p>}<p>Pendências de apuração: {s.pending}</p></section>)}</div>
   {state.stores.length === 0 && <p>Nenhuma loja encontrada nesta consulta.</p>}
   <section className="rounded-xl border p-4 space-y-2"><p>Última conferência: {state.last_sync_at ? date(state.last_sync_at) : 'ainda não informada'}</p>{state.sync_error && <p role="alert" className="text-red-800">Falha na conferência: {state.sync_error}</p>}<p className="text-sm text-gray-600">A atualização confere as vendas automaticamente. Pagamentos pendentes, vendas aguardando conferência e custos ausentes podem deixar valores pendentes. Custo ausente não é considerado zero. Se houver fila ou falha, tente atualizar novamente.</p></section>
   <section className="overflow-x-auto"><h3 className="font-bold text-lg">Produtos na promoção</h3><table className="w-full text-sm"><thead><tr>{['Produto', 'Loja', 'Unidades', 'Receita após desconto', 'Custo', 'Margem bruta'].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{state.products.map(p => <tr key={`${p.store_id}:${p.product_id}`} className="border-t"><td className="p-2">{p.name}</td><td className="p-2">{storeName(p.store_id)}</td><td className="p-2">{p.quantity}</td><td className="p-2">{formatBRL(p.revenue)}</td><td className="p-2">{money(p.cost)}</td><td className="p-2">{money(p.margin)}</td></tr>)}</tbody></table>{!state.products.length && <p>Nenhum produto neste filtro.</p>}</section>
   <section className="overflow-x-auto"><h3 className="font-bold text-lg">Vendas na promoção</h3><table className="w-full text-sm"><thead><tr>{['Venda', 'Loja', 'Data', 'Pagamento / situação', 'Unidades', 'Receita após desconto', 'Custo', 'Margem bruta', 'Apuração'].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{state.sales.map(s => <tr key={s.sale_id} className="border-t"><td className="p-2">#{s.number}</td><td className="p-2">{s.store_name}</td><td className="p-2">{date(s.created_at)}</td><td className="p-2">{status(s.status)}</td><td className="p-2">{s.quantity}</td><td className="p-2">{formatBRL(s.revenue)}</td><td className="p-2">{money(s.cost)}</td><td className="p-2">{money(s.margin)}</td><td className="p-2">{s.cost == null ? 'Custo pendente' : s.pending ? 'Conferência pendente' : 'Conferida'}</td></tr>)}</tbody></table>{!state.sales.length && <p>Nenhuma venda neste filtro.</p>}</section>
  </>}
  <StorePrizes key={filters.campaign} campaign={filters.campaign}/>
 </div>
}
