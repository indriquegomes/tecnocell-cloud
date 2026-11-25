import Link from 'next/link'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { calcularSaldosContas } from '@/lib/saldos-contas'
import { ehCompraDeMercadoria } from '@/lib/financeiro-setores'
import { formatBRL, hojeSP } from '@/lib/utils'
import { marcarPago } from '../financeiro/actions'
import { guardarNaMeta } from './actions'
import { NovaMovimentacao } from './NovaMovimentacao'

// PAINEL FINANCEIRO — protótipo aprovado pelo dono (25/11/2026).
// Tokens visuais da especificação: tinta #1F1B3A, fundo #F7F3EA, branco dos
// cards, verde-menta #34C79D (entrou), coral #FF7A6B (saiu), azul #5BC0EB
// (sobrou), amarelo #FFD25A (destaque), violeta #7B6CF6 (foco).
//
// Este módulo NÃO recalcula regra de dinheiro: lê o saldo das contas da fonte
// única (lib/saldos-contas), a baixa usa o `marcarPago` do Financeiro e a nova
// movimentação grava em `lancamentos` com as mesmas travas (valor > 0, mês
// fechado, conta resolvida pela forma). Metas de poupança são tabelas novas e
// separadas das metas de venda.

const INK = '#1F1B3A'
const CREAM = '#F7F3EA'
const MINT = '#34C79D'
const CORAL = '#FF7A6B'
const BLUE = '#5BC0EB'
const YELLOW = '#FFD25A'
const SEC = '#5E5780'

const CARD = 'rounded-[18px] border-2 border-[#1F1B3A] bg-white shadow-[0_3px_0_#1F1B3A]'

function brl(v: number) {
  // "Negativos com sinal − antes do R$" (seção 5); positivos sem sinal.
  return v < 0 ? `−${formatBRL(Math.abs(v))}` : formatBRL(v)
}

function nomeMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${nomes[(m || 1) - 1]}/${ano}`
}

function diaCurto(iso: string | null | undefined) {
  const d = (iso ?? '').slice(0, 10)
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—'
}

function Pote({ cor, pct, nome }: { cor: string; pct: number; nome: string }) {
  const p = Math.max(0, Math.min(100, pct))
  const altura = (78 * p) / 100
  return (
    <svg viewBox="0 0 80 100" className="h-[136px] w-[110px]" role="img" aria-label={`Meta ${nome}, ${Math.round(p)}% concluída`}>
      <defs>
        <clipPath id={`pote-${nome.replace(/\s+/g, '-')}`}>
          <rect x="10" y="18" width="60" height="72" rx="16" />
        </clipPath>
      </defs>
      <rect x="10" y="18" width="60" height="72" rx="16" fill="#FFFFFF" stroke={INK} strokeWidth="2.5" />
      <rect x="14" y={90 - altura} width="52" height={altura} fill={cor} clipPath={`url(#pote-${nome.replace(/\s+/g, '-')})`} opacity="0.95" />
      <rect x="10" y="18" width="60" height="72" rx="16" fill="none" stroke={INK} strokeWidth="2.5" />
      <rect x="6" y="8" width="68" height="14" rx="7" fill={YELLOW} stroke={INK} strokeWidth="2.5" />
    </svg>
  )
}

export default async function PainelFinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; mes?: string; msg?: string }>
}) {
  const params = await searchParams
  const aba = params.aba === 'metas' ? 'metas' : params.aba === 'nova' ? 'nova' : 'inicio'
  const hoje = hojeSP()
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? '') ? (params.mes as string) : hoje.slice(0, 7)
  const [ano, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const proxMes = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
  const iniTs = inicio + 'T00:00:00-03:00'
  const fimTs = proxMes + 'T00:00:00-03:00'

  const supabase = await createServiceClient()

  const [{ data: contas }, { data: metas }, pendentes, entradasP, recebimentos, compras, despesas, recentes] =
    await Promise.all([
      supabase.from('contas').select('id, saldo_inicial, tipo, loja_id').eq('ativa', true),
      supabase.from('metas_poupanca').select('id, nome, cor, atual, objetivo').eq('ativo', true).order('nome'),
      fetchAll<{ id: string; tipo: string; descricao: string | null; pessoa_nome: string | null; valor: number | null; valor_pago: number | null; data_vencimento: string | null }>((from, to) =>
        supabase.from('lancamentos').select('id, tipo, descricao, pessoa_nome, valor, valor_pago, data_vencimento')
          .in('tipo', ['pagar', 'receber']).eq('status', 'pendente')
          .not('data_vencimento', 'is', null)
          .order('data_vencimento').order('id').range(from, to)),
      fetchAll<{ valor: number | null }>((from, to) =>
        supabase.from('pagamentos_venda').select('valor, vendas!inner(data, status, uso_interno)')
          .eq('status', 'pago').eq('vendas.status', 'concluida').eq('vendas.uso_interno', false)
          .gte('vendas.data', iniTs).lt('vendas.data', fimTs).order('id').range(from, to)),
      fetchAll<{ valor: number | null }>((from, to) =>
        supabase.from('movimentos_caixa').select('valor, tipo')
          .eq('tipo', 'recebimento').gte('created_at', iniTs).lt('created_at', fimTs).order('id').range(from, to)),
      fetchAll<{ total_item: number | null }>((from, to) =>
        supabase.from('itens_nota_entrada').select('total_item, notas_entrada!inner(data_entrada, status)')
          .neq('notas_entrada.status', 'cancelada')
          .gte('notas_entrada.data_entrada', inicio).lt('notas_entrada.data_entrada', proxMes).order('id').range(from, to)),
      fetchAll<{ valor: number | null; categoria: string | null }>((from, to) =>
        supabase.from('lancamentos').select('valor, categoria').eq('tipo', 'pagar').eq('status', 'pago')
          .gte('data_pagamento', iniTs).lt('data_pagamento', fimTs).order('id').range(from, to)),
      fetchAll<{ id: string; tipo: string; descricao: string | null; pessoa_nome: string | null; valor: number | null; data_pagamento: string | null }>((from, to) =>
        supabase.from('lancamentos').select('id, tipo, descricao, pessoa_nome, valor, data_pagamento')
          .eq('status', 'pago').gte('data_pagamento', iniTs).lt('data_pagamento', fimTs)
          .order('data_pagamento', { ascending: false }).order('id').range(from, to)),
    ])

  const saldosContas = await calcularSaldosContas(
    supabase,
    (contas ?? []) as { id: string; saldo_inicial?: number | null; tipo?: string | null; loja_id?: string | null }[],
  )
  const totalContas = Object.values(saldosContas).reduce((s, v) => s + v, 0)
  const guardado = (metas ?? []).reduce((s, mm) => s + Number((mm as { atual?: number | null }).atual ?? 0), 0)
  const saldo = totalContas - guardado

  const entrou = entradasP.reduce((s, p) => s + Number(p.valor ?? 0), 0) + recebimentos.reduce((s, r) => s + Number(r.valor ?? 0), 0)
  const saiu = compras.reduce((s, c) => s + Number(c.total_item ?? 0), 0)
    + despesas.filter((d) => !ehCompraDeMercadoria(d.categoria)).reduce((s, d) => s + Number(d.valor ?? 0), 0)
  const sobrou = entrou - saiu
  const maxBarra = Math.max(entrou, saiu, 1)

  const aVencer = pendentes.slice(0, 6)
  const ultimas = recentes.slice(0, 5)
  const voltar = `${'/painel/painel-financeiro'}?aba=inicio&mes=${mes}`

  const TAB = (ativo: boolean) =>
    `inline-flex min-h-[46px] items-center rounded-[14px] border-2 border-[#1F1B3A] px-4 text-[15px] font-bold text-[#1F1B3A] transition-[transform,box-shadow] duration-100 hover:-translate-y-px active:translate-y-[2px] ${ativo ? 'bg-[#FFD25A] shadow-[0_3px_0_#1F1B3A]' : 'bg-white shadow-[0_3px_0_#1F1B3A]'}`

  return (
    <div className="-m-6 min-h-full bg-[#F7F3EA] p-6" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: INK }}>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" />

      {/* Cabeçalho do conteúdo */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">{aba === 'metas' ? 'Metas' : aba === 'nova' ? 'Nova movimentação' : 'Painel financeiro'}</h1>
          <p role="status" className="mt-1 text-[14px] font-semibold" style={{ color: SEC }}>{params.msg ?? 'Tudo o que entrou, saiu e sobrou, num lugar só.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2" action="/painel/painel-financeiro" method="get">
            <input type="hidden" name="aba" value={aba} />
            <label htmlFor="mes" className="sr-only">Mês</label>
            <input id="mes" name="mes" type="month" defaultValue={mes}
              className="min-h-[46px] rounded-[14px] border-2 border-[#1F1B3A] bg-white px-3 text-[14px] font-bold focus:outline focus:outline-[3px] focus:outline-offset-2 focus:outline-[#7B6CF6]" />
            <button type="submit" className="min-h-[46px] rounded-[14px] border-2 border-[#1F1B3A] bg-white px-4 text-[14px] font-bold shadow-[0_3px_0_#1F1B3A] hover:-translate-y-px active:translate-y-[2px] focus:outline focus:outline-[3px] focus:outline-offset-2 focus:outline-[#7B6CF6]">Ver</button>
          </form>
          <Link href={`/painel/painel-financeiro?aba=nova&mes=${mes}`}
            className="inline-flex min-h-[46px] items-center rounded-[14px] border-2 border-[#1F1B3A] bg-[#FFD25A] px-4 text-[15px] font-bold shadow-[0_3px_0_#1F1B3A] hover:-translate-y-px active:translate-y-[2px] focus:outline focus:outline-[3px] focus:outline-offset-2 focus:outline-[#7B6CF6]">
            + Nova movimentação
          </Link>
        </div>
      </div>

      {/* Menu do painel (as três telas do protótipo) */}
      <nav aria-label="Seções do painel" className="mb-6 flex flex-wrap gap-2">
        <Link href={`/painel/painel-financeiro?aba=inicio&mes=${mes}`} aria-current={aba === 'inicio' ? 'page' : undefined} className={TAB(aba === 'inicio')}>Início</Link>
        <Link href={`/painel/painel-financeiro?aba=metas&mes=${mes}`} aria-current={aba === 'metas' ? 'page' : undefined} className={TAB(aba === 'metas')}>Metas</Link>
        <Link href={`/painel/painel-financeiro?aba=nova&mes=${mes}`} aria-current={aba === 'nova' ? 'page' : undefined} className={TAB(aba === 'nova')}>Nova movimentação</Link>
      </nav>

      {aba === 'inicio' && (
        <>
          {/* Bloco A — quatro cards de resumo */}
          <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <div className={`${CARD} p-5`}>
              <p className="text-[13px] font-bold uppercase tracking-wide" style={{ color: SEC }}>Tenho agora</p>
              <p className="mt-1 text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{brl(saldo)}</p>
              <p className="mt-2 text-[13px] font-semibold" style={{ color: SEC }}>saldo das contas − {brl(guardado)} guardado</p>
            </div>
            <div className={`${CARD} p-5`} style={{ background: MINT }}>
              <div className="flex items-start justify-between">
                <p className="text-[13px] font-bold uppercase tracking-wide">Entrou</p>
                <span aria-hidden className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border-2" style={{ borderColor: INK }}>↓</span>
              </div>
              <p className="mt-1 text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{brl(entrou)}</p>
              <p className="mt-2 text-[13px] font-semibold">{nomeMes(mes)} · as duas lojas</p>
            </div>
            <div className={`${CARD} p-5`} style={{ background: CORAL }}>
              <div className="flex items-start justify-between">
                <p className="text-[13px] font-bold uppercase tracking-wide">Saiu</p>
                <span aria-hidden className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border-2" style={{ borderColor: INK }}>↑</span>
              </div>
              <p className="mt-1 text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{brl(saiu)}</p>
              <p className="mt-2 text-[13px] font-semibold">{nomeMes(mes)} · as duas lojas</p>
            </div>
            <div className={`${CARD} p-5`} style={{ background: BLUE }}>
              <div className="flex items-start justify-between">
                <p className="text-[13px] font-bold uppercase tracking-wide">Sobrou</p>
                <span aria-hidden className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border-2" style={{ borderColor: INK }}>+</span>
              </div>
              <p className="mt-1 text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{brl(sobrou)}</p>
              <p className="mt-2 text-[13px] font-semibold">Entrou − Saiu</p>
            </div>
          </section>

          {/* Bloco B — A vencer + Entrou x Saiu */}
          <section className="mt-5 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
            <div className={`${CARD} p-5`}>
              <h2 className="text-[19px] font-extrabold">A vencer</h2>
              <p className="mt-0.5 text-[13px] font-semibold" style={{ color: SEC }}>contas que ainda não foram pagas ou recebidas</p>
              {aVencer.length === 0 ? (
                <p className="mt-4 text-[14px] font-semibold" style={{ color: SEC }}>Nenhuma conta em aberto.</p>
              ) : (
                <ul className="mt-3 divide-y-2" style={{ borderColor: '#E8E0CC' }}>
                  {aVencer.map((c) => {
                    const pagar = c.tipo === 'pagar'
                    const nome = (c.pessoa_nome ?? c.descricao ?? 'Conta').trim()
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                        <span aria-hidden className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border-2 text-[17px] font-extrabold" style={{ borderColor: INK, background: pagar ? '#FFE3E0' : '#D9F6EE' }}>{pagar ? '↑' : '↓'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold" style={{ color: SEC }}>{pagar ? 'Pagar' : 'Receber'} · {diaCurto(c.data_vencimento)}</span>
                          <span className="block truncate text-[17px] font-bold">{nome}</span>
                        </span>
                        <span className="text-[17px] font-extrabold tabular-nums">{brl(Math.max(0, Number(c.valor ?? 0) - Number(c.valor_pago ?? 0)))}</span>
                        <form action={marcarPago.bind(null, c.id)} className="flex items-center gap-2">
                          <input type="hidden" name="_voltar" value={voltar} />
                          {pagar && <input type="hidden" name="saiu_gaveta" value="1" />}
                          <label className="sr-only" htmlFor={`forma-${c.id}`}>Forma de pagamento</label>
                          <select id={`forma-${c.id}`} name="forma_pagamento" defaultValue="Dinheiro"
                            className="min-h-[46px] rounded-[14px] border-2 bg-white px-2 text-[14px] font-bold focus:outline focus:outline-[3px] focus:outline-offset-2 focus:outline-[#7B6CF6]" style={{ borderColor: INK }}>
                            <option value="Dinheiro">Dinheiro</option>
                            <option value="PIX">PIX</option>
                          </select>
                          <button type="submit"
                            className="min-h-[46px] rounded-[14px] border-2 bg-[#FFD25A] px-4 text-[15px] font-bold shadow-[0_3px_0_#1F1B3A] hover:-translate-y-px active:translate-y-[2px] active:shadow-[0_1px_0_#1F1B3A] focus:outline focus:outline-[3px] focus:outline-offset-2 focus:outline-[#7B6CF6]"
                            style={{ borderColor: INK }}>
                            {pagar ? 'Pagar' : 'Receber'}
                          </button>
                        </form>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className={`${CARD} p-5`}>
              <h2 className="text-[19px] font-extrabold">Entrou x Saiu</h2>
              <p className="mt-0.5 text-[13px] font-semibold" style={{ color: SEC }}>{nomeMes(mes)}</p>
              <div className="mt-4 space-y-3">
                {[{ rotulo: 'Entrou', valor: entrou, cor: MINT }, { rotulo: 'Saiu', valor: saiu, cor: CORAL }].map((b) => (
                  <div key={b.rotulo}>
                    <div className="flex items-center justify-between text-[13px] font-bold">
                      <span>{b.rotulo}</span>
                      <span className="tabular-nums">{brl(b.valor)}</span>
                    </div>
                    <div className="mt-1 h-4 rounded-full border-2 bg-[#F7F3EA]" style={{ borderColor: INK }}>
                      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, (b.valor / maxBarra) * 100)}%`, background: b.cor }} />
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-5 border-t-2 pt-3 text-[13px] font-bold uppercase tracking-wide" style={{ borderColor: '#E8E0CC', color: SEC }}>Últimas movimentações</p>
              {ultimas.length === 0 ? (
                <p className="mt-2 text-[14px] font-semibold" style={{ color: SEC }}>Nenhuma movimentação no período.</p>
              ) : (
                <ul className="mt-2 divide-y-2" style={{ borderColor: '#E8E0CC' }}>
                  {ultimas.map((mv) => {
                    const entrada = mv.tipo === 'receber'
                    return (
                      <li key={mv.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{(mv.pessoa_nome ?? mv.descricao ?? 'Movimentação').trim()}</span>
                          <span className="block text-[13px] font-semibold" style={{ color: SEC }}>{diaCurto(mv.data_pagamento)}</span>
                        </span>
                        <span className="shrink-0 font-extrabold tabular-nums" style={{ color: entrada ? '#0B5E4D' : '#B42318' }}>
                          {entrada ? '+' : '−'}{formatBRL(Math.abs(Number(mv.valor ?? 0)))}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </>
      )}

      {aba === 'metas' && (
        <>
          <div className={`${CARD} mb-5 p-5`}>
            <p className="text-[13px] font-bold uppercase tracking-wide" style={{ color: SEC }}>Dinheiro livre para guardar</p>
            <p className="mt-1 text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{brl(saldo)}</p>
            <p className="mt-2 text-[13px] font-semibold" style={{ color: SEC }}>saldo das contas − {brl(guardado)} já guardado nas metas</p>
          </div>

          {(metas ?? []).length === 0 ? (
            <p className="text-[14px] font-semibold" style={{ color: SEC }}>Nenhuma meta cadastrada.</p>
          ) : (
            <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
              {(metas ?? []).map((meta) => {
                const mais = meta as { id: string; nome: string; cor: string | null; atual: number | null; objetivo: number | null }
                const atual = Number(mais.atual ?? 0)
                const objetivo = Number(mais.objetivo ?? 0)
                const pct = objetivo > 0 ? Math.round((atual / objetivo) * 100) : 0
                const atingida = atual >= objetivo
                return (
                  <div key={mais.id} className={`${CARD} flex flex-col items-center p-5 text-center`}>
                    <Pote cor={mais.cor ?? MINT} pct={pct} nome={mais.nome} />
                    <p className="mt-3 text-[17px] font-bold">{mais.nome}</p>
                    <p className="text-[13px] font-semibold" style={{ color: SEC }}>{pct}% da meta</p>
                    <p className="mt-1 text-[14px] font-bold tabular-nums">{brl(atual)} de {brl(objetivo)}</p>
                    {atingida ? (
                      <p className="mt-3 text-[14px] font-extrabold" style={{ color: '#0B5E4D' }}>Meta atingida</p>
                    ) : (
                      <form action={guardarNaMeta} className="mt-3 w-full">
                        <input type="hidden" name="meta_id" value={mais.id} />
                        <input type="hidden" name="valor" value="500" />
                        <button type="submit"
                          className="min-h-[46px] w-full rounded-[14px] border-2 border-[#1F1B3A] bg-[#FFD25A] px-4 text-[15px] font-bold shadow-[0_3px_0_#1F1B3A] hover:-translate-y-px active:translate-y-[2px] active:shadow-[0_1px_0_#1F1B3A] focus:outline focus:outline-[3px] focus:outline-offset-2 focus:outline-[#7B6CF6]">
                          Guardar R$ 500
                        </button>
                      </form>
                    )}
                  </div>
                )
              })}
            </section>
          )}
        </>
      )}

      {aba === 'nova' && <NovaMovimentacao />}
    </div>
  )
}
