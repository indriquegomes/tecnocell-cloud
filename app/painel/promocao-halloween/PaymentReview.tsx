'use client'

import { useRef, useState } from 'react'
import { formatBRL } from '@/lib/utils'

type Receipt = { id: string; valor: number; descricao: string | null; created_at: string; payment_day: string | null; claimed: boolean }
type Review = { source: { id: string; customer: string; amount: number; created_at: string; loja_id: string; loja: string }; payment: { status: string; paid_at: string | null; payment_day: string | null } | null; receipts: Receipt[]; existing_ticket: string | null }
type Pending = { id: string; numero: number; payment_day: string | null }
type Issued = { id: string; token: string; expires_at: string }
type Props = { campaign: string; disabled: boolean; rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>; onBusyChange: (busy: boolean) => void; onIssued: () => Promise<void> }
const input = 'w-full rounded-xl border border-purple-700 bg-purple-950 px-3 py-2 text-purple-50'
const button = 'rounded-xl bg-orange-300 px-4 py-2 font-semibold text-purple-950 disabled:opacity-50'
const date = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export default function PaymentReview({ campaign, disabled, rpc, onBusyChange, onIssued }: Props) {
  const [kind, setKind] = useState('os'), [number, setNumber] = useState('')
  const [review, setReview] = useState<Review | null>(null), [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string[]>([]), [paid, setPaid] = useState(''), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState<Pending[] | null>(null), [pendingOffset, setPendingOffset] = useState(0)
  const [issued, setIssued] = useState<Issued | null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const blocked = disabled || busy
  async function action(fn: () => Promise<void>) {
    if (blocked || busyRef.current) return
    busyRef.current = true; setBusy(true); onBusyChange(true); setMessage('')
    try { await fn() } catch (e) { setMessage(e instanceof Error ? e.message : 'Não foi possível confirmar. Tente novamente.') } finally { busyRef.current = false; setBusy(false); onBusyChange(false) }
  }
  async function lookup(next = 0) {
    const data = await rpc('payment_review', { p_campaign: campaign, p_kind: kind, p_number: Number(number), p_offset: next }) as Review
    setReview(data); setOffset(next)
  }
  async function loadPending(next = 0) {
    setPending(await rpc('payment_pending', { p_campaign: campaign, p_offset: next }) as Pending[]); setPendingOffset(next)
  }
  return <section className="space-y-4 rounded-2xl border border-orange-400/40 bg-purple-950 p-5 text-purple-100">
    <h2 className="text-xl font-bold text-white">Conferência de quitação e OS</h2>
    <p className="text-sm">Compra e quitação integral de 26 a 31/10. Para OS, abertura também no período. O giro dura 48 horas desde a quitação; liberar depois não reinicia o prazo.</p>
    <p className="text-sm text-orange-200">Esta área consulta os recebimentos do Cloud. Não registra pagamentos nem altera o financeiro. Comprovante externo sem recebimento no Cloud não libera giro.</p>
    <button className={button} disabled={blocked} onClick={() => void action(() => loadPending())}>Ver compras aguardando horário</button>
    {pending && <div className="space-y-2 text-sm">
      {pending.slice(0, 50).map(item => <p key={item.id}>Venda #{item.numero} · dia registrado: {item.payment_day || 'não informado'}</p>)}
      {!pending.length && <p>Nenhuma compra aguardando conferência de horário nesta página.</p>}
      <div className="flex gap-3"><button className={button} disabled={blocked || pendingOffset === 0} onClick={() => void action(() => loadPending(pendingOffset - 50))}>Pendências anteriores</button><button className={button} disabled={blocked || pending.length <= 50} onClick={() => void action(() => loadPending(pendingOffset + 50))}>Próximas pendências</button></div>
    </div>}
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); void action(async () => { setReview(null); setIssued(null); setSelected([]); setPaid(''); setReason(''); setConfirmed(false); await lookup() }) }}>
      <label>Origem<select className={input} disabled={blocked} value={kind} onChange={e => { setKind(e.target.value); setReview(null); setSelected([]); setIssued(null) }}><option value="os">Ordem de serviço</option><option value="sale">Venda com horário pendente</option></select></label>
      <label>Número<input className={input} disabled={blocked} required type="number" min={1} step={1} value={number} onChange={e => { setNumber(e.target.value); setReview(null); setIssued(null); setSelected([]) }} /></label>
      <button className={button} disabled={blocked}>Consultar recebimentos</button>
    </form>
    {review && <div className="space-y-3 rounded-xl border border-purple-700 p-4 text-sm">
      <p className="font-semibold">{review.source.customer} · {formatBRL(Number(review.source.amount))}</p>
      <p>Loja de retirada: {review.source.loja}</p>
      <p>Abertura/compra: {date(review.source.created_at)}</p>
      {review.existing_ticket && <p className="text-orange-200">Já existe giro para esta origem. Consulte o histórico do cliente; não será criado outro.</p>}
      <p>Recebimentos pagos cadastrados. Confira valor, referência e loja antes de selecionar.</p>
      {review.receipts.slice(0, 50).map(receipt => <label className="flex items-start gap-2 rounded-lg bg-purple-900 p-3" key={receipt.id}>
        {kind === 'os' && <input type="checkbox" disabled={blocked || receipt.claimed || !!review.existing_ticket} checked={selected.includes(receipt.id)} onChange={e => setSelected(old => e.target.checked ? [...old, receipt.id] : old.filter(id => id !== receipt.id))} />}
        <span>{formatBRL(Number(receipt.valor))} · {receipt.descricao || 'Recebimento'}<br />Referência: {receipt.id}<br />Dia do pagamento: {receipt.payment_day || 'ausente'}{receipt.claimed && ' · Já vinculado a uma participação'}</span>
      </label>)}
      {!review.receipts.length && <p>Nenhum recebimento compatível nesta página. Regularize pelo processo financeiro existente; não crie giro sem comprovação.</p>}
      <div className="flex gap-3"><button className={button} disabled={blocked || offset === 0} onClick={() => void action(() => lookup(offset - 50))}>Recebimentos anteriores</button><button className={button} disabled={blocked || review.receipts.length <= 50} onClick={() => void action(() => lookup(offset + 50))}>Próximos recebimentos</button></div>
      {kind === 'sale' && review.payment?.status !== 'needs_time' && <p>Esta venda não está aguardando horário. Pagamento pendente não libera giro; uma quitação com horário comprovado segue a captura automática.</p>}
      {!review.existing_ticket && (kind === 'os' || review.payment?.status === 'needs_time') && <form className="space-y-3 border-t border-purple-700 pt-4" onSubmit={e => { e.preventDefault(); void action(async () => {
        const stamp = new Date(`${paid}:00-03:00`)
        if (!Number.isFinite(stamp.getTime())) throw new Error('Informe data e hora válidas de Brasília.')
        const args: Record<string, unknown> = { p_campaign: campaign, p_paid_at: stamp.toISOString(), p_reason: reason.trim(), p_confirm: confirmed }
        if (kind === 'os') { args.p_os = review.source.id; args.p_receipts = selected } else { args.p_sale = review.source.id }
        const result = await rpc(kind === 'os' ? 'issue_os_manual' : 'confirm_sale_time', args) as Issued
        setIssued(result); setConfirmed(false); await onIssued(); await lookup(offset)
        setMessage('Giro confirmado no servidor. A validade conta desde a quitação informada, sem renovar pelo clique.')
      }) }}>
        <label className="block">Quitação integral — data e hora de Brasília<input required disabled={blocked} className={input} type="datetime-local" step={60} value={paid} onChange={e => setPaid(e.target.value)} /></label>
        <label className="block">Motivo e referência da conferência<input required disabled={blocked} className={input} minLength={5} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <label className="flex items-start gap-2"><input required type="checkbox" disabled={blocked} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Conferi a quitação integral no Cloud, o horário do comprovante e a loja da compra/OS.</label>
        <button className={button} disabled={blocked || (kind === 'os' && !selected.length)}>Liberar giro após conferência</button>
      </form>}
    </div>}
    {issued && <div className="space-y-2 rounded-xl bg-purple-900 p-4"><p>Giro vence: {date(issued.expires_at)}</p><label className="block">Link exclusivo<input readOnly className={input} value={`https://roleta-mal-assombrada-tecnocell.vercel.app/#giro=${issued.token}`} /></label><button className={button} onClick={() => void action(async () => { await navigator.clipboard.writeText(`https://roleta-mal-assombrada-tecnocell.vercel.app/#giro=${issued.token}`); setMessage('Link copiado. O prazo já está correndo.') })} disabled={blocked}>Copiar link do giro</button></div>}
    <p role="status" aria-live="polite" className="whitespace-pre-wrap text-orange-200">{message || (busy ? 'Conferindo…' : '')}</p>
  </section>
}
