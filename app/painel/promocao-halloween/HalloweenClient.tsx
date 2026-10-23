'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL } from '@/lib/utils'
import PaymentReview from './PaymentReview'

type Offer = { id: number; name: string; benefit_type: 'percent' | 'price'; benefit_value: number; unlimited_units?: boolean; loja?: string | null }
type Product = Offer & { quantity: number; remaining: number; weight: number; unlimited: boolean; enabled: boolean }
type Coupon = { code: string; offer: Offer; status: string; expires_at: string; redeemed_at: string | null }
type Customer = { client_key: string; customer: string; total: number; available: number; used: number; expired: number; revoked: number }
type Ticket = { id: string; purchase_ref: string; amount_cents: number; created_at: string; expires_at: string; status: string; token: string; result: Coupon | null; loja?: string | null; replaces_coupon_id?: string | null; paid_at?: string | null; source_created_at?: string | null; emission_origin?: string | null }
type CampaignState = {
  campaign: { id: string; active: boolean; test_mode: boolean }; stock_confirmed: boolean
  clients_total: number; stores: { id: string; nome: string }[]; last_sync_at: string | null; sync_error: string | null; products: Product[]; clients: Customer[]
  metrics: { tickets: number; spins: number; redeemed: number }; pending: { numero: number }[]
}
type Lookup = { customer: string; purchase_ref: string; test_mode: boolean; result: Coupon }
const date = (s: string) => new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const benefit = (p: Offer) => p.benefit_type === 'percent' && p.benefit_value === 100 ? 'Produto grátis' : p.benefit_type === 'price' ? `Por ${formatBRL(p.benefit_value / 100)}` : `${p.benefit_value}% de desconto`
const status = (s: string) => ({ available: 'Disponível', used: 'Giro realizado', expired: 'Vencido', redeemed: 'Resgatado', revoked: 'Cancelado', replaced: 'Giro devolvido' }[s] ?? s)
const button = 'rounded-xl bg-orange-300 px-4 py-2 font-semibold text-purple-950 hover:bg-orange-200 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300'
const input = 'w-full rounded-xl border border-purple-700 bg-purple-950 px-3 py-2 text-purple-50 focus:outline-2 focus:outline-orange-300'
const panel = 'rounded-2xl border border-purple-800 bg-purple-950 p-5 sm:p-6'
const roulette = 'https://roleta-mal-assombrada-tecnocell.vercel.app/'

export default function HalloweenClient() {
  const [supabase] = useState(createClient)
  const [campaign, setCampaign] = useState('halloween-2026')
  const [state, setState] = useState<CampaignState | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [confirmed, setConfirmed] = useState(false), [active, setActive] = useState(false)
  const [dirty, setDirty] = useState(false), dirtyRef = useRef(false)
  const [busy, setBusy] = useState(false), busyRef = useRef(false)
  const [message, setMessage] = useState(''), [search, setSearch] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([]), [more, setMore] = useState(false)
  const [code, setCode] = useState(''), [lookup, setLookup] = useState<Lookup | null>(null)
  const [appliedSearch, setAppliedSearch] = useState(''), [clientOffset, setClientOffset] = useState(0)
  const [redemptionStore, setRedemptionStore] = useState(''), [replacementReason, setReplacementReason] = useState('')
  const [replacement, setReplacement] = useState<{ token: string; expires_at: string } | null>(null)
  const [testName, setTestName] = useState(''), [testPurchase, setTestPurchase] = useState(''), [testAmount, setTestAmount] = useState('200')
  const campaignRef = useRef(campaign)
  campaignRef.current = campaign
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    // Reuses the existing Cloud session, without a second login or service-role key.
    const { data, error } = await supabase.rpc(`halloween_${name}`, args)
    if (error) throw new Error(['55P03', '40P01', '57014'].includes(error.code) ? 'A conferência encontrou uma disputa ou atingiu o limite de tempo. Tente novamente; uma operação já concluída recupera o mesmo giro ou vale.' : error.message)
    return data as T
  }
  function apply(next: CampaignState) {
    setState(next)
    if (!dirtyRef.current) { setProducts(next.products); setConfirmed(next.stock_confirmed); setActive(next.campaign.active) }
  }
  async function refresh(term = appliedSearch, offset = clientOffset) {
    const requestedCampaign = campaign
    const next = await rpc<CampaignState>('admin_state_v2', { p_campaign: requestedCampaign, p_search: term, p_offset: offset })
    if (campaignRef.current === requestedCampaign) apply(next)
  }
  async function action(fn: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setMessage('')
    try { await fn() } catch (e) { setMessage(e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  useEffect(() => {
    let alive = true, loaded = false
    setState(null); setCustomer(null); setTickets([]); setLookup(null); setCode(''); setMessage(''); setSearch(''); setAppliedSearch(''); setClientOffset(0); setReplacement(null); setReplacementReason(''); setRedemptionStore('')
    const load = async () => {
      if (busyRef.current || dirtyRef.current || document.hidden) return
      busyRef.current = true; setBusy(true)
      try {
        const next = await supabase.rpc('halloween_admin_state_v2', { p_campaign: campaign, p_search: '', p_offset: 0 })
        if (!alive) return
        if (next.error) throw new Error(next.error.message)
        apply(next.data as CampaignState); loaded = true
      } catch (e) { if (alive) setMessage(e instanceof Error ? e.message : 'Falha ao carregar a campanha.') }
      finally { if (alive) { busyRef.current = false; setBusy(false) } }
    }
    void load()
    const onVisible = () => { if (!loaded && !document.hidden) void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); busyRef.current = false }
  }, [campaign, supabase])
  function changed() { dirtyRef.current = true; setDirty(true) }
  async function history(c: Customer, append = false) {
    const items = await rpc<Ticket[]>('client_tickets', { p_campaign: campaign, p_customer: c.client_key, p_offset: append ? tickets.length : 0 })
    setCustomer(c); setTickets(previous => append ? [...previous, ...items] : items); setMore(items.length === 50)
  }
  async function copy(t: Pick<Ticket, 'token'>) {
    try { await navigator.clipboard.writeText(`${roulette}#giro=${t.token}`); setMessage('Link copiado. Envie ao cliente; o prazo de 48 horas já está correndo.') }
    catch { setMessage('Selecione o link exibido e copie manualmente.') }
  }
  async function consult(value: string) { setReplacement(null); setReplacementReason(''); setLookup(null); setLookup(await rpc<Lookup>('lookup', { p_code: value.trim().toUpperCase() })) }
  async function save() {
    if (products.some(p => !Number.isInteger(p.quantity) || !Number.isInteger(p.weight))) throw new Error('Use quantidades inteiras e chances com até duas casas decimais.')
    if (products.reduce((sum, p) => sum + p.weight, 0) !== 10000) throw new Error('As chances base devem somar 100%.')
    const next = await rpc<CampaignState>('configure', { p_campaign: campaign, p_products: products.map(({ id, quantity, weight, enabled }) => ({ id, quantity, weight, enabled })), p_confirm: confirmed, p_active: active })
    dirtyRef.current = false; setDirty(false); apply(next); setMessage('Configuração salva no servidor.')
  }
  return <main className="mx-auto max-w-7xl space-y-5 p-4 text-purple-100 sm:p-7">
    <section className={`${panel} border-orange-400/40`}>
      <h1 className="mt-2 text-3xl font-bold text-white">Promoção <span className="text-orange-300">Halloween</span></h1>
      <p className="mt-3 text-purple-200">Compra e quitação integral de R$ 200 ou mais, de 26 a 31 de outubro, geram um giro com 48 horas após a quitação. Acompanhe o cliente, copie o link e confira a oferta no resgate, usando seu acesso do Cloud.</p>
      <div className="mt-5 flex flex-wrap items-end gap-3"><label className="text-sm">Campanha<select className={`${input} mt-1`} value={campaign} disabled={busy || dirty} onChange={e => setCampaign(e.target.value)}><option value="halloween-2026">Campanha real</option><option value="halloween-2026-test">Homologação — sem valor real</option></select></label><button className={button} disabled={busy || dirty} onClick={() => void action(async () => { await refresh(); if (customer) await history(customer) })}>Atualizar</button><a className="px-3 py-2 text-orange-200 underline" href={roulette} target="_blank" rel="noopener noreferrer">Ver roleta do cliente</a></div>
      {state && <p className="mt-4 rounded-xl bg-purple-900 p-3 text-sm">{state.campaign.test_mode ? 'HOMOLOGAÇÃO — giros e vales sem valor de resgate.' : state.campaign.active ? 'Campanha ativa. Vendas pagas conferidas a cada minuto. Atualize este painel para ver novidades.' : 'Campanha pausada. Confira os cupons disponíveis e as quantidades dos dois prêmios grátis antes de ativar. Compras anteriores à ativação não geram giros.'}</p>}
      <p role="status" aria-live="polite" className="mt-3 whitespace-pre-wrap text-orange-200">{message || (busy ? 'Conferindo…' : '')}</p>
    </section>
    {!state && <p className={`${panel} text-sm`}>{busy ? 'Carregando campanha com seu acesso do Cloud…' : 'Use Atualizar para tentar novamente. Seu acesso deve estar autorizado na promoção.'}</p>}
    {state && <>
      <dl className="grid gap-3 sm:grid-cols-3">{[['Giros liberados', state.metrics.tickets], ['Giros realizados', state.metrics.spins], ['Vales resgatados', state.metrics.redeemed]].map(([label, value]) => <div className={panel} key={label}><dt className="text-sm text-purple-300">{label}</dt><dd className="mt-2 text-3xl font-bold text-orange-200">{value}</dd></div>)}</dl>
      {state.campaign.test_mode && <section className={panel}><h2 className="text-xl font-bold text-white">Liberar giro de teste</h2><p className="mt-2 text-sm text-purple-200">Somente homologação. Não cria venda nem oferta com valor real.</p><form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); void action(async () => {
        const issued = await rpc<{ id: string; customer: string }>('issue', { p_campaign: campaign, p_ref: testPurchase.trim(), p_customer: testName.trim(), p_amount: Math.round(Number(testAmount) * 100) })
        await refresh(); await history({ client_key: `test:${issued.id}`, customer: issued.customer, total: 1, available: 1, used: 0, expired: 0, revoked: 0 }); setMessage('Giro de teste localizado. Confira o histórico abaixo.')
      }) }}><label className="text-sm">Referência do teste<input disabled={busy} className={`${input} mt-1`} required maxLength={100} value={testPurchase} onChange={e => setTestPurchase(e.target.value)} /></label><label className="text-sm">Nome de teste<input disabled={busy} className={`${input} mt-1`} required maxLength={80} value={testName} onChange={e => setTestName(e.target.value)} /></label><label className="text-sm">Valor de teste (R$)<input disabled={busy} className={`${input} mt-1`} required type="number" min={200} max={1000000} step="0.01" value={testAmount} onChange={e => setTestAmount(e.target.value)} /></label><button className={button} disabled={busy}>Gerar giro de teste</button></form></section>}
      {!state.campaign.test_mode && <PaymentReview key={campaign} campaign={campaign} disabled={busy || dirty} rpc={rpc} onBusyChange={value => { busyRef.current = value; setBusy(value) }} onIssued={() => refresh()} />}
      <section className={panel}><h2 className="text-xl font-bold text-white">Giros por cliente</h2><p className="mt-2 text-sm text-purple-200">Identifique o cliente na venda do Cloud. Giro: 48 horas após a quitação integral. Vale: 48 horas após o sorteio. Copiar o link não confirma o envio.</p><p className="mt-2 text-sm text-orange-200">{state.sync_error || (!state.campaign.test_mode && `Última conferência: ${state.last_sync_at ? date(state.last_sync_at) : 'aguardando'}`)}</p>
        {!!state.pending.length && <p className="mt-3 rounded-xl bg-orange-300/10 p-3 text-orange-200">{state.pending.length} venda(s) sem cliente: {state.pending.map(p => p.numero || 'sem número').join(', ')}. Identifique no Cloud antes de completar 48 horas.</p>}
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void action(async () => { await refresh(search, 0); setAppliedSearch(search); setClientOffset(0); setCustomer(null); setTickets([]) }) }}><label className="block max-w-md text-sm">Buscar cliente<input disabled={busy} maxLength={80} className={`${input} mt-1`} type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><button className={button} disabled={busy}>Buscar em todos os clientes</button></form>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-purple-300"><tr>{['Cliente', 'Total', 'Disponíveis', 'Usados', 'Vencidos', 'Cancelados', 'Histórico'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{state.clients.map(c => <tr key={c.client_key} className="border-t border-purple-800"><td className="p-3 font-semibold">{c.customer}</td>{[c.total, c.available, c.used, c.expired, c.revoked].map((v, i) => <td className="p-3" key={i}>{v}</td>)}<td className="p-3"><button className={button} disabled={busy} onClick={() => void action(() => history(c))}>Ver giros</button></td></tr>)}</tbody></table></div>{!state.clients.length && <p className="py-4 text-purple-300">Nenhum cliente encontrado nesta busca.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><button className={button} disabled={busy || clientOffset === 0} onClick={() => void action(async () => { await refresh(appliedSearch, clientOffset - 50); setClientOffset(clientOffset - 50) })}>Anteriores</button><span>{state.clients_total} cliente(s) · página {Math.floor(clientOffset / 50) + 1}</span><button className={button} disabled={busy || clientOffset + 50 >= state.clients_total} onClick={() => void action(async () => { await refresh(appliedSearch, clientOffset + 50); setClientOffset(clientOffset + 50) })}>Próximos</button></div>
        {customer && <div className="mt-6 space-y-3"><h3 className="text-lg font-bold text-orange-200">{customer.customer}</h3>{tickets.map(t => <article key={t.id} className="rounded-xl border border-purple-700 bg-purple-900/50 p-4 text-sm"><h4 className="font-bold text-white">{status(t.status)} · {formatBRL(t.amount_cents / 100)}</h4><p className="mt-2 break-all">Compra: {t.purchase_ref}</p>{t.loja && <p className="mt-1 font-semibold text-orange-200">Retirada: {t.loja}</p>}{t.source_created_at && <p>Abertura/compra: {date(t.source_created_at)}</p>}{t.paid_at && <p>Quitação comprovada: {date(t.paid_at)} · {t.emission_origin === "auto" ? "Automática" : "Conferência da equipe"}</p>}{t.replaces_coupon_id && <p className="mt-1">Giro devolvido · novas 48 horas</p>}<p className="mt-1">Liberado: {date(t.created_at)} · Giro vence: {date(t.expires_at)}</p>
          {t.result && <div className="mt-3 space-y-1 text-orange-100"><p className="font-semibold">{benefit(t.result.offer)} · {t.result.offer.name}</p><p className="break-all">Vale: {t.result.code} · {status(t.result.status)}</p><p>Vale vence: {date(t.result.expires_at)}</p>{t.result.redeemed_at && <p>Resgatado: {date(t.result.redeemed_at)}</p>}{t.status === 'revoked' && t.result.redeemed_at && <p className="font-bold text-orange-300">Compra cancelada após o resgate. Conferir com a gerência.</p>}<button className={`${button} mt-2`} disabled={busy} onClick={() => void action(async () => { setCode(t.result!.code); await consult(t.result!.code) })}>Conferir vale</button></div>}
          {t.status === 'available' && <div className="mt-3 space-y-2"><label className="block">Link exclusivo<input disabled={busy} readOnly className={`${input} mt-1`} value={`${roulette}#giro=${t.token}`} onFocus={e => e.target.select()} /></label><button className={button} onClick={() => void copy(t)}>Copiar link para enviar</button></div>}
        </article>)}{more && <button className={button} disabled={busy} onClick={() => void action(() => history(customer, true))}>Ver mais giros</button>}</div>}
      </section>
      <section className={panel}><h2 className="text-xl font-bold text-white">Conferir e resgatar vale</h2><form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void action(() => consult(code)) }}><label className="min-w-0 flex-1 text-sm">Código do vale<input disabled={busy} required maxLength={40} placeholder="TC-..." className={`${input} mt-1`} value={code} onChange={e => { setCode(e.target.value); setLookup(null); setReplacement(null); setReplacementReason('') }} /></label><button className={button} disabled={busy}>Consultar</button></form>
        {lookup && <div className="mt-4 space-y-2 rounded-xl bg-purple-900 p-4 text-sm"><p className="font-bold text-orange-200">{lookup.test_mode && 'TESTE · '}{benefit(lookup.result.offer)} · {lookup.result.offer.name}</p><p>{lookup.customer} · {lookup.purchase_ref}</p>{lookup.result.offer.loja && <p className="font-semibold">Retirada somente em {lookup.result.offer.loja}</p>}<p>{lookup.result.offer.unlimited_units ? "Desconto somente neste modelo, em quantas unidades quiser nesta compra. Uso único e sem acumular promoções." : lookup.result.offer.benefit_type === "percent" && lookup.result.offer.benefit_value === 100 ? "Prêmio grátis: uma unidade, com uso único do vale." : "Benefício somente no modelo indicado, conforme o valor deste vale. Uso único."}</p><p>{status(lookup.result.status)} · Vence {date(lookup.result.expires_at)}</p>{lookup.result.redeemed_at && <p>Resgatado em {date(lookup.result.redeemed_at)}</p>}{lookup.result.status === 'available' && <><p>Confira cliente, produto e loja antes de confirmar a entrega. Registre o desconto ou brinde no PDV existente.</p><label className="block">Loja da retirada<select className={`${input} mt-1`} value={redemptionStore} onChange={e => setRedemptionStore(e.target.value)}><option value="">Selecione a loja</option>{state.stores.map(store => <option key={store.id} value={store.id}>{store.nome}</option>)}</select></label><button className={button} disabled={busy || (!lookup.test_mode && !redemptionStore)} onClick={() => void action(async () => { const result = await rpc<Coupon>('redeem_at', { p_code: lookup.result.code, p_loja: redemptionStore || null }); setLookup({ ...lookup, result }); await refresh(); if (customer) await history(customer); setMessage(lookup.test_mode ? 'Resgate de teste registrado.' : 'Resgate registrado. Este vale não pode ser usado novamente.') })}>Confirmar resgate desta oferta</button>
          <div className="mt-5 border-t border-purple-700 pt-4"><h3 className="font-bold">Produto indisponível?</h3><p className="mt-1">Esta ação cancela este cupom e devolve um giro com novas 48 horas. O mesmo link do cliente continuará funcionando. O produto indisponível fica fora do novo sorteio.</p><form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); void action(async () => { const next = await rpc<{ token: string; expires_at: string }>('reissue', { p_code: lookup.result.code, p_reason: replacementReason.trim() }); setReplacement(next); setLookup({ ...lookup, result: { ...lookup.result, status: 'replaced' } }); await refresh(); if (customer) await history(customer); setMessage('Cupom cancelado. Um giro foi devolvido com novas 48 horas. O link anterior continua válido.') }) }}><label className="block">Motivo da indisponibilidade<input className={input} disabled={busy} required minLength={5} maxLength={300} value={replacementReason} onChange={e => setReplacementReason(e.target.value)} /></label><label className="flex items-start gap-2"><input type="checkbox" required disabled={busy} />Conferi que o produto está indisponível e que este cupom será cancelado.</label><button className={button} disabled={busy}>Cancelar cupom e devolver 1 giro</button></form></div></>}</div>}
      </section>
      {replacement && <section className={panel}><h2 className="text-xl font-bold">Giro devolvido</h2><p className="mt-2">Válido até {date(replacement.expires_at)}. O link anterior também abre este giro.</p><label className="mt-3 block text-sm">Link do giro devolvido<input className={input} readOnly value={`${roulette}#giro=${replacement.token}`} onFocus={e => e.target.select()} /></label><button className={button} onClick={() => void copy(replacement)}>Copiar link para enviar</button></section>}
      <section className={panel}><h2 className="text-xl font-bold text-white">Estoque e chances de ganhar</h2><p className="mt-2 text-sm text-purple-200">Estoque exclusivo da promoção. Total inclui reservas e resgates. Onze modelos dão cupons de desconto, sem limite de emissão ou unidades do mesmo modelo na compra de resgate. Somente iCharge8Pro e Sunshine são grátis, uma unidade por vale. Os descontos e as chances são números separados. Cada prêmio grátis mantém 0,5% de chance enquanto disponível. Confira a disponibilidade física na loja.</p><form onSubmit={e => { e.preventDefault(); void action(save) }}><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-purple-300"><tr>{['Oferta', 'Total', 'Disponível', 'Chance base (%)', 'Participando'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{products.map(p => <tr className="border-t border-purple-800" key={p.id}><td className="min-w-48 p-3">{p.name}<small className="block text-orange-200">{benefit(p)}</small></td><td className="p-3">{p.unlimited ? <span>Cupons sem limite</span> : <input disabled={busy} aria-label={`Quantidade de ${p.name}`} type="number" min={state.products.find(x => x.id === p.id)!.quantity - p.remaining} max={100000} step={1} required className={`${input} min-w-24`} value={p.quantity} onChange={e => { changed(); setProducts(previous => previous.map(x => x.id === p.id ? { ...x, quantity: Number(e.target.value) } : x)) }} />}</td><td className="p-3">{p.unlimited ? "Sem limite de cupons" : p.remaining}</td><td className="p-3"><input disabled={busy || p.id >= 12} aria-label={`Chance base de ${p.name}`} type="number" min={0} max={100} step={0.01} required className={`${input} min-w-24`} value={p.weight / 100} onChange={e => { changed(); setProducts(previous => previous.map(x => x.id === p.id ? { ...x, weight: Math.round(Number(e.target.value) * 100) } : x)) }} /></td><td className="p-3"><input type="checkbox" aria-label={`Disponibilidade de ${p.name}`} disabled={busy} checked={p.enabled} onChange={e => { changed(); setProducts(previous => previous.map(x => x.id === p.id ? { ...x, enabled: e.target.checked } : x)) }} /></td></tr>)}</tbody></table></div><label className="mt-5 flex gap-2 text-sm"><input disabled={busy} type="checkbox" checked={confirmed} onChange={e => { changed(); setConfirmed(e.target.checked) }} />Conferi os descontos, a disponibilidade, as quantidades dos prêmios grátis e as chances.</label><label className="mt-3 flex gap-2 text-sm"><input disabled={busy} type="checkbox" checked={active} onChange={e => { changed(); setActive(e.target.checked) }} />Ativar esta campanha. Na campanha real, compras elegíveis começam a gerar giros.</label><button className={`${button} mt-4`} disabled={busy}>Salvar configuração</button>{dirty && <button type="button" className="ml-3 text-sm underline" disabled={busy} onClick={() => { dirtyRef.current = false; setDirty(false); apply(state) }}>Descartar alterações</button>}</form></section>
    </>}
  </main>
}
