import Link from 'next/link'
import type { ReactNode } from 'react'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { calcularSaldosContas } from '@/lib/saldos-contas'
import { ehCompraDeMercadoria } from '@/lib/financeiro-setores'
import { formatBRL, hojeSP } from '@/lib/utils'
import { marcarPago } from '../financeiro/actions'
import { guardarNaMeta } from './actions'
import { NovaMovimentacao } from './NovaMovimentacao'

// PAINEL FINANCEIRO — implementação fiel do protótipo aprovado pelo dono
// (25/11/2026). Tokens e medidas copiados do HTML aprovado:
//   tinta #1F1B3A · fundo #F7F3EA · verde-menta #34C79D · coral #FF7A6B ·
//   azul #5BC0EB · amarelo #FFD25A · lilás do aviso #EDE7FF · divisória #E8E0CC
//   cartão .k: branco, borda 2px, raio 18, sombra 0 3px 0 (sem desfoque)
//   botão .bt: borda 2px, raio 14, alt 46, 700 14px, fundo amarelo
//
// O que este módulo NÃO recalcula (fonte única): saldo das contas
// (lib/saldos-contas), baixa de conta via `marcarPago` do Financeiro (travas de
// caixa/nota/mês fechado) e nova movimentação gravando em `lancamentos`.

const INK = '#1F1B3A'
const CREAM = '#F7F3EA'
const MINT = '#34C79D'
const CORAL = '#FF7A6B'
const BLUE = '#5BC0EB'
const YELLOW = '#FFD25A'
const SEC = '#5E5780'
const LINE = '#E8E0CC'

const CARD = 'rounded-[18px] border-2 border-[#1F1B3A] bg-white shadow-[0_3px_0_#1F1B3A]'
const BTN = 'inline-flex min-h-[46px] items-center justify-center rounded-[14px] border-2 border-[#1F1B3A] px-[18px] text-[14px] font-bold text-[#1F1B3A] shadow-[0_3px_0_#1F1B3A] transition-[transform,box-shadow] duration-100 hover:-translate-y-px active:translate-y-[2px] active:shadow-[0_1px_0_#1F1B3A] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]'
const NAVBASE = 'flex min-h-[48px] items-center gap-3 rounded-[14px] border-2 px-3.5 text-left text-[15px] font-bold text-[#1F1B3A] transition-colors duration-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]'

const COR_CATEGORIA: Record<string, string> = {
  Venda: '#34C79D', Serviço: '#5BC0EB', Outros: '#C9C2E3',
  Peças: '#FF7A6B', Salários: '#34C79D', Aluguel: '#5BC0EB',
  Contas: '#FFD25A', Impostos: '#7B6CF6',
}

function brl(v: number) {
  return v < 0 ? `−${formatBRL(Math.abs(v))}` : formatBRL(v)
}

function nomeMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${nomes[(m || 1) - 1]}/${ano}`
}

function dataLonga(iso: string) {
  const d = new Date(iso + 'T12:00:00-03:00')
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' })
}

function diaCurto(iso: string | null | undefined | Date) {
  if (!iso) return '—'
  const s = typeof iso === 'string' ? iso.slice(0, 10) : iso.toISOString().slice(0, 10)
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`
}

// Pote do protótipo (mesmos caminhos): tampa amarela, corpo lilás, líquido
// preenchido de baixo para cima em 78 * pct / 100.
function Pote({ cor, pct, nome }: { cor: string; pct: number; nome: string }) {
  const p = Math.max(0, Math.min(100, pct))
  const h = (78 * p) / 100
  const id = 'pote-' + nome.replace(/\W+/g, '')
  return (
    <svg width="110" height="136" viewBox="0 0 80 100" role="img" aria-label={`Meta ${nome}, ${Math.round(p)}% concluída`}>
      <defs>
        <clipPath id={id}>
          <path d="M16 18h48q8 0 8 10v54q0 14-14 14H22q-14 0-14-14V28q0-10 8-10z" />
        </clipPath>
      </defs>
      <rect x="20" y="3" width="40" height="12" rx="5" fill={YELLOW} stroke={INK} strokeWidth="3" />
      <path d="M16 18h48q8 0 8 10v54q0 14-14 14H22q-14 0-14-14V28q0-10 8-10z" fill="#F3EEFF" />
      {h > 0 && <rect x="0" y={96 - h} width="80" height={h} fill={cor} clipPath={`url(#${id})`} />}
      <path d="M16 18h48q8 0 8 10v54q0 14-14 14H22q-14 0-14-14V28q0-10 8-10z" fill="none" stroke={INK} strokeWidth="3" />
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
  const voltar = `/painel/painel-financeiro?aba=inicio&mes=${mes}`

  return (
    <div className="-m-6 min-h-full bg-[#F7F3EA] text-[#1F1B3A]" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&display=swap" />

      <div className="flex min-h-full flex-wrap" style={{ background: CREAM }}>
        {/* ── Barra lateral (250px, branca, linha grossa à direita) ── */}
        <aside className="flex basis-[250px] flex-col gap-2.5 border-r-[3px] border-[#1F1B3A] bg-white px-4 py-5">
          <div className="flex items-center gap-2.5 px-2 pb-3.5 text-xl font-black">
            <span aria-hidden className="inline-block h-[30px] w-[30px] rounded-[9px] border-2 border-[#1F1B3A] bg-[#FFD25A]" />
            TecnoCell
          </div>
          <Nava href={`/painel/painel-financeiro?aba=inicio&mes=${mes}`} ativo={aba === 'inicio'}>Início</Nava>
          <Nava href={`/painel/painel-financeiro?aba=metas&mes=${mes}`} ativo={aba === 'metas'}>Metas</Nava>
          <Nava href={`/painel/painel-financeiro?aba=nova&mes=${mes}`} ativo={aba === 'nova'}>Nova movimentação</Nava>

          <div className={`${CARD} mt-auto p-3.5`} style={{ background: '#EDE7FF' }}>
            <b>Dica</b>
            <div className="mt-1 text-[13px] font-semibold" style={{ color: INK }}>
              Use Pagar ou Receber em “A vencer” e veja o saldo mudar na hora.
            </div>
          </div>
        </aside>

        {/* ── Conteúdo ── */}
        <main className="min-w-0 flex-[999_1_560px] px-0 py-0 lg:p-7">
          <div className="flex flex-col gap-5 p-5 lg:p-0">
            {/* Cabeçalho */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
                  {aba === 'metas' ? 'Metas' : aba === 'nova' ? 'Nova movimentação' : 'Painel financeiro'}
                </h1>
                <div className="mt-0.5 text-[14px] font-semibold" style={{ color: SEC }} role="status">
                  {params.msg ?? `${dataLonga(hoje)} · as duas lojas`}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <form action="/painel/painel-financeiro" method="get" className="flex items-center gap-2">
                  <input type="hidden" name="aba" value={aba} />
                  <label htmlFor="mes" className="sr-only">Mês</label>
                  <input id="mes" name="mes" type="month" defaultValue={mes}
                    className="min-h-[46px] rounded-[14px] border-2 border-[#1F1B3A] bg-white px-3 text-[14px] font-bold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]" />
                  <button type="submit" className={`${BTN} bg-white`}>Ver</button>
                </form>
                <Link href={`/painel/painel-financeiro?aba=nova&mes=${mes}`} className={`${BTN} bg-[#FFD25A]`}>+ Nova movimentação</Link>
              </div>
            </div>

            {aba === 'inicio' && (
              <>
                {/* Quatro cards */}
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                  <div className={`${CARD} flex flex-col gap-2 p-[18px]`}>
                    <span className="text-[13px] font-semibold" style={{ color: SEC }}>Tenho agora</span>
                    <span className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums">{brl(saldo)}</span>
                    <svg width="90" height="32" viewBox="0 0 90 32" aria-hidden="true">
                      <polyline points="0,26 15,22 30,24 45,14 60,16 75,8 90,4" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className={`${CARD} flex flex-col gap-2 p-[18px]`} style={{ background: MINT }}>
                    <span aria-hidden className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border-2 border-[#1F1B3A] bg-white">↓</span>
                    <span className="text-[13px] font-extrabold">Entrou</span>
                    <span className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums">{brl(entrou)}</span>
                  </div>
                  <div className={`${CARD} flex flex-col gap-2 p-[18px]`} style={{ background: CORAL }}>
                    <span aria-hidden className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border-2 border-[#1F1B3A] bg-white">↑</span>
                    <span className="text-[13px] font-extrabold">Saiu</span>
                    <span className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums">{brl(saiu)}</span>
                  </div>
                  <div className={`${CARD} flex flex-col gap-2 p-[18px]`} style={{ background: BLUE }}>
                    <span aria-hidden className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border-2 border-[#1F1B3A] bg-white font-extrabold">+</span>
                    <span className="text-[13px] font-extrabold">Sobrou</span>
                    <span className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums">{brl(sobrou)}</span>
                  </div>
                </div>

                {/* A vencer + Entrou x Saiu */}
                <div className="grid items-start gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
                  <div className={`${CARD} p-5`}>
                    <h2 className="mb-2 text-[19px] font-extrabold leading-tight tracking-[-0.01em]">A vencer</h2>
                    {aVencer.length === 0 ? (
                      <p className="text-[14px] font-semibold" style={{ color: SEC }}>Nenhuma conta em aberto.</p>
                    ) : aVencer.map((c, i) => {
                      const pagar = c.tipo === 'pagar'
                      const nome = (c.pessoa_nome ?? c.descricao ?? 'Conta').trim()
                      const venc = (c.data_vencimento ?? '').slice(0, 10)
                      const label = `${pagar ? 'Pagar' : 'Receber'} · ${venc === hoje ? 'hoje' : diaCurto(c.data_vencimento)}`
                      return (
                        <div key={c.id} className="flex items-center gap-3 py-3" style={i === 0 ? undefined : { borderTop: `1px solid ${LINE}` }}>
                          <span aria-hidden className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[12px] border-2 border-[#1F1B3A] text-[16px] font-extrabold" style={{ background: pagar ? '#FFE3E0' : '#D9F6EE' }}>{pagar ? '↑' : '↓'}</span>
                          <div className="flex-1">
                            <div className="text-[13px] font-semibold" style={{ color: SEC }}>{label}</div>
                            <div className="text-[17px] font-black">{nome}</div>
                          </div>
                          <div className="text-[17px] font-black tabular-nums">{brl(Math.max(0, Number(c.valor ?? 0) - Number(c.valor_pago ?? 0)))}</div>
                          <form action={marcarPago.bind(null, c.id)} className="flex items-center gap-2">
                            <input type="hidden" name="_voltar" value={voltar} />
                            {pagar && <input type="hidden" name="saiu_gaveta" value="1" />}
                            <label className="sr-only" htmlFor={`forma-${c.id}`}>Forma de pagamento</label>
                            <select id={`forma-${c.id}`} name="forma_pagamento" defaultValue="Dinheiro"
                              className="min-h-[46px] rounded-[14px] border-2 border-[#1F1B3A] bg-white px-2 text-[13px] font-bold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]">
                              <option value="Dinheiro">Dinheiro</option>
                              <option value="PIX">PIX</option>
                            </select>
                            <button type="submit" className={`${BTN} bg-[#FFD25A]`}>{pagar ? 'Pagar' : 'Receber'}</button>
                          </form>
                        </div>
                      )
                    })}
                  </div>

                  <div className={`${CARD} flex flex-col gap-3 p-5`}>
                    <h2 className="text-[19px] font-extrabold leading-tight tracking-[-0.01em]">Entrou x Saiu</h2>
                    {[{ rotulo: 'Entrou', valor: entrou, cor: MINT }, { rotulo: 'Saiu', valor: saiu, cor: CORAL }].map((b) => (
                      <div key={b.rotulo}>
                        <div className="text-[13px] font-semibold" style={{ color: SEC }}>{b.rotulo} · <b className="tabular-nums">{brl(b.valor)}</b></div>
                        <div className="mt-1 h-[14px] overflow-hidden rounded-[7px] border-2 border-[#1F1B3A]" style={{ background: CREAM }}>
                          <div className="h-full transition-[width] duration-300" style={{ width: `${Math.min(100, (b.valor / maxBarra) * 100)}%`, background: b.cor }} />
                        </div>
                      </div>
                    ))}

                    <h2 className="mt-1.5 text-[19px] font-extrabold leading-tight tracking-[-0.01em]">Últimas movimentações</h2>
                    {ultimas.length === 0 ? (
                      <p className="text-[14px] font-semibold" style={{ color: SEC }}>Nenhuma movimentação no período.</p>
                    ) : ultimas.map((mv, i) => {
                      const entrada = mv.tipo === 'receber'
                      return (
                        <div key={mv.id} className="flex items-center gap-3 py-3" style={i === 0 ? undefined : { borderTop: `1px solid ${LINE}` }}>
                          <div className="flex-1">
                            <div className="text-[17px] font-black">{(mv.pessoa_nome ?? mv.descricao ?? 'Movimentação').trim()}</div>
                            <div className="text-[13px] font-semibold" style={{ color: SEC }}>{diaCurto(mv.data_pagamento)}</div>
                          </div>
                          <div className="text-[17px] font-black tabular-nums" style={{ color: entrada ? '#0B5E4D' : '#B42318' }}>
                            {entrada ? '+ ' : '− '}{formatBRL(Math.abs(Number(mv.valor ?? 0))).replace('− ', '')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {aba === 'metas' && (
              <>
                <div className="text-[15px] font-semibold" style={{ color: SEC }}>
                  Dinheiro livre para guardar: <b className="tabular-nums" style={{ color: INK }}>{brl(saldo)}</b>
                </div>
                {(metas ?? []).length === 0 ? (
                  <p className="text-[14px] font-semibold" style={{ color: SEC }}>Nenhuma meta cadastrada.</p>
                ) : (
                  <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                    {(metas ?? []).map((meta) => {
                      const mm = meta as { id: string; nome: string; cor: string | null; atual: number | null; objetivo: number | null }
                      const atual = Number(mm.atual ?? 0)
                      const objetivo = Number(mm.objetivo ?? 0)
                      const pct = objetivo > 0 ? Math.round((atual / objetivo) * 100) : 0
                      const atingida = atual >= objetivo
                      return (
                        <div key={mm.id} className={`${CARD} flex flex-col items-center gap-2 p-4 text-center`}>
                          <Pote cor={mm.cor ?? MINT} pct={pct} nome={mm.nome} />
                          <span className="text-[18px] font-black">{mm.nome}</span>
                          <span className="rounded-full border-2 border-[#1F1B3A] px-3 py-[1px] text-[13px] font-black" style={{ background: CREAM }}>{pct}% da meta</span>
                          <span className="text-[13px] font-semibold" style={{ color: SEC }}>
                            <b className="tabular-nums" style={{ color: INK }}>{brl(atual)}</b> de <b className="tabular-nums" style={{ color: INK }}>{brl(objetivo)}</b>
                          </span>
                          {atingida ? (
                            <span className="mt-1 text-[14px] font-extrabold" style={{ color: '#0B5E4D' }}>Meta atingida</span>
                          ) : (
                            <form action={guardarNaMeta} className="mt-1 w-full">
                              <input type="hidden" name="meta_id" value={mm.id} />
                              <input type="hidden" name="valor" value="500" />
                              <button type="submit" className={`${BTN} w-full bg-[#FFD25A]`}>Guardar R$ 500</button>
                            </form>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {aba === 'nova' && <NovaMovimentacao />}
          </div>
        </main>
      </div>
    </div>
  )
}

// Item do menu lateral: mesma régua do protótipo (.nb / .nb.on).
function Nava({ href, ativo, children }: { href: string; ativo: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={ativo ? 'page' : undefined}
      className={`${NAVBASE} ${ativo ? 'border-[#1F1B3A] bg-[#FFD25A]' : 'border-transparent hover:bg-[#F2ECDC]'}`}>
      {children}
    </Link>
  )
}
