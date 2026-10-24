'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Prize = { store_id: string; store_name: string; slot: number; code: string; name: string; quantity: number; remaining: number; enabled: boolean }
type Draft = { quantity: string; confirmed: boolean }
const field = 'rounded-lg border border-purple-300 bg-white p-2 text-gray-900'
const errorText = (error: { code?: string; message: string }) => ['PGRST202', '42883'].includes(error.code ?? '') ? 'O controle de brindes por loja ainda não está instalado neste ambiente. Instale a atualização antes de configurar as quantidades.' : error.message

export default function StorePrizes({ campaign }: { campaign: string }) {
 const [client] = useState(createClient)
 const [rows, setRows] = useState<Prize[]>([]), [drafts, setDrafts] = useState<Record<string, Draft>>({})
 const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
 const campaignRef = useRef(campaign), sequence = useRef(0), saving = useRef(false), epoch = useRef(0)
 if (campaignRef.current !== campaign) { campaignRef.current = campaign; sequence.current++; epoch.current++; saving.current = false }
 const key = (p: Prize) => `${p.store_id}:${p.slot}`
 async function load(selected = campaignRef.current) {
  const request = ++sequence.current
  setBusy(true); setMessage('')
  try {
   const { data, error } = await client.rpc('halloween_store_prizes_state', { p_campaign: selected })
   if (request !== sequence.current || selected !== campaignRef.current) return
   if (error) throw new Error(errorText(error))
   const next = (data ?? []) as Prize[]
   setRows(next); setDrafts(Object.fromEntries(next.map(p => [key(p), { quantity: String(p.quantity), confirmed: false }])))
  } catch (error) { if (request === sequence.current && selected === campaignRef.current) { setRows([]); setMessage(error instanceof Error ? error.message : 'Não foi possível consultar os brindes.') } }
  finally { if (request === sequence.current && selected === campaignRef.current) setBusy(false) }
 }
 useEffect(() => {
  setRows([]); setDrafts({}); setMessage(''); let loaded = false
  const visibleLoad = () => { if (loaded || document.hidden) return; loaded = true; void load(campaign) }
  visibleLoad(); document.addEventListener('visibilitychange', visibleLoad)
  return () => { sequence.current++; document.removeEventListener('visibilitychange', visibleLoad) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [campaign])
 function edit(p: Prize, change: Partial<Draft>) { setDrafts(previous => ({ ...previous, [key(p)]: { ...previous[key(p)], ...change } })) }
 async function save(p: Prize) {
  const draft = drafts[key(p)]
  if (saving.current || !draft?.confirmed || !/^\d+$/.test(draft.quantity) || !Number.isSafeInteger(Number(draft.quantity))) return
  const selected = campaignRef.current, request = ++sequence.current, savingEpoch = epoch.current
  saving.current = true; setBusy(true); setMessage('')
  try {
   const { error } = await client.rpc('halloween_configure_store_prize', { p_campaign: selected, p_store: p.store_id, p_slot: p.slot, p_quantity: Number(draft.quantity), p_confirm: true })
   if (selected !== campaignRef.current || request !== sequence.current) return
   if (error) throw new Error(errorText(error))
   await load(selected)
  } catch (error) { if (selected === campaignRef.current && request === sequence.current) setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a quantidade.') }
  finally { if (savingEpoch === epoch.current) { saving.current = false; setBusy(false) } }
 }
 return <section className="rounded-xl border border-purple-200 p-5 space-y-4">
  <h3 className="text-lg font-bold text-purple-900">Brindes raros separados por loja</h3>
  <p className="text-sm text-gray-600">Controle interno dos brindes gratuitos. Confira fisicamente as unidades separadas antes de salvar. A quantidade total inclui os prêmios já reservados; alterar esse limite preserva as reservas existentes. Esta configuração não movimenta o estoque de venda nem o caixa.</p>
  <button type="button" disabled={busy} onClick={() => void load()} className="rounded-lg border border-purple-300 px-4 py-2 disabled:opacity-40">{busy ? 'Aguarde…' : 'Atualizar brindes'}</button>
  {message && <p role="alert" className="rounded-lg bg-orange-100 p-3">{message}</p>}
  {[...new Set(rows.map(p => p.store_id))].map(store => <div key={store} className="space-y-3"><h4 className="font-bold">{rows.find(p => p.store_id === store)?.store_name}</h4>{rows.filter(p => p.store_id === store).map(p => {
   const draft = drafts[key(p)] ?? { quantity: '', confirmed: false }
   const valid = /^\d+$/.test(draft.quantity) && Number.isSafeInteger(Number(draft.quantity))
   return <div key={key(p)} className="rounded-lg border p-4 space-y-3"><p><strong>{p.name}</strong> · código {p.code} · posição {p.slot}</p><p className="text-sm">Quantidade total: {p.quantity} · Ainda disponíveis: {p.remaining} · {p.enabled ? 'Habilitado para sorteios após a liberação da loja' : 'Desabilitado para sorteios'}</p><label className="block">Quantidade total separada para esta campanha<input type="number" min="0" step="1" className={`${field} ml-2 w-28`} value={draft.quantity} disabled={busy} onChange={e => edit(p, { quantity: e.target.value, confirmed: false })}/></label><label className="flex gap-2"><input type="checkbox" checked={draft.confirmed} disabled={busy} onChange={e => edit(p, { confirmed: e.target.checked })}/>Conferi fisicamente e separei esta quantidade nesta loja.</label><button type="button" className="rounded-lg bg-purple-800 px-4 py-2 text-white disabled:opacity-40" disabled={busy || !draft.confirmed || !valid} onClick={() => void save(p)}>Salvar quantidade deste brinde</button></div>
  })}</div>)}
  {!busy && !message && rows.length === 0 && <p>Nenhum brinde por loja encontrado nesta campanha.</p>}
 </section>
}
