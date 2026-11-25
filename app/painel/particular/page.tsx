import Link from 'next/link'
import type { ReactNode } from 'react'
import { createServiceClient, requirePermissao, fetchAll } from '@/lib/supabase/server'
import { formatBRL, hojeSP } from '@/lib/utils'
import { resumoParticular } from '@/lib/particular'
import { guardarNoPote, pagarParticular, criarPote } from './actions'
import { AnotarParticular } from './AnotarParticular'

// ABA PARTICULAR — painel divertido (protótipo aprovado pelo dono, 25/11).
// Roda em tela cheia, com barra própria: Início · Meus potinhos · Anotar dinheiro.
// Tokens do protótipo divertido: fonte Nunito, tinta #2B2350, fundo #FFF8EC,
// bordas 3px, cantos 16px, amarelo #FFC93C, verde-menta #2EC4A0, coral #FF6B6B,
// azul #4CC9F0, lilás #EDE7FF.
//
// Régua (lib/particular.ts): pró-labore do mês é o dinheiro reservado; conta
// particular paga sai dele; o que sobra é o que pode ser retirado. Nada aqui é
// despesa da loja.
//
// Potes = metas_poupanca com escopo 'pessoal' (separados das metas do negócio).

const INK = '#2B2350'
const BG = '#FFF8EC'
const MINT = '#2EC4A0'
const CORAL = '#FF6B6B'
const BLUE = '#4CC9F0'
const YELLOW = '#FFC93C'
const SEC = '#6B6390'
const LINE = '#E8E2F1'
const LILAC = '#EDE7FF'

const CARD = 'rounded-[16px] border-[3px] border-[#2B2350] bg-white shadow-[0_3px_0_#2B2350]'
const BTN = 'inline-flex min-h-[46px] items-center justify-center rounded-[16px] border-[3px] border-[#2B2350] px-[18px] text-[16px] font-extrabold text-[#2B2350] shadow-[0_3px_0_#2B2350] transition-[transform,box-shadow] duration-100 hover:-translate-y-px active:translate-y-[2px] active:shadow-[0_1px_0_#2B2350] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]'
const NAV = 'flex min-h-[48px] items-center rounded-[16px] border-[3px] px-3.5 text-left text-[16px] font-extrabold text-[#2B2350] transition-colors duration-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]'

function brl(v: number) {
  return v < 0 ? `−${formatBRL(Math.abs(v))}` : formatBRL(v)
}

function diaCurto(iso: string | null | undefined) {
  const s = (iso ?? '').slice(0, 10)
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
}

function Pote({ cor, pct, nome }: { cor: string; pct: number; nome: string }) {
  const p = Math.max(0, Math.min(100, pct))
  const h = (78 * p) / 100
  const id = 'pote-' + nome.replace(/\W+/g, '')
  return (
    <svg width="110" height="136" viewBox="0 0 80 100" role="img" aria-label={`Pote ${nome}, ${Math.round(p)}% cheio`}>
      <defs><clipPath id={id}><path d="M16 18h48q8 0 8 10v54q0 14-14 14H22q-14 0-14-14V28q0-10 8-10z" /></clipPath></defs>
      <rect x="20" y="3" width="40" height="12" rx="5" fill={YELLOW} stroke={INK} strokeWidth="3" />
      <path d="M16 18h48q8 0 8 10v54q0 14-14 14H22q-14 0-14-14V28q0-10 8-10z" fill={LILAC} />
      {h > 0 && <rect x="0" y={96 - h} width="80" height={h} fill={cor} clipPath={`url(#${id})`} />}
      <path d="M16 18h48q8 0 8 10v54q0 14-14 14H22q-14 0-14-14V28q0-10 8-10z" fill="none" stroke={INK} strokeWidth="3" />
    </svg>
  )
}

export default async function ParticularPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; msg?: string }>
}) {
  await requirePermissao('master')
  const params = await searchParams
  const aba = params.aba === 'potinhos' ? 'potinhos' : params.aba === 'anotar' ? 'anotar' : 'inicio'
  const hoje = hojeSP()
  const mesAtual = hoje.slice(0, 7)
  const [ano, m] = mesAtual.split('-').map(Number)
  const de = `${mesAtual}-01`
  const prox = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
  const iniTs = de + 'T00:00:00-03:00'
  const fimTs = prox + 'T00:00:00-03:00'

  const supabase = await createServiceClient()

  const [linhas, entradasP, aVencer, recentes, potesRes, aportes] = await Promise.all([
    fetchAll<{ id: string; descricao: string | null; valor: number | null; valor_pago: number | null; status: string | null; categoria: string | null; subcategoria: string | null; data_vencimento: string | null; data_pagamento: string | null }>((from, to) =>
      supabase.from('lancamentos')
        .select('id, descricao, valor, valor_pago, status, categoria, subcategoria, data_vencimento, data_pagamento')
        .eq('tipo', 'pagar').in('categoria', ['Pró-labore', 'Particular'])
        .gte('data_vencimento', de).lt('data_vencimento', prox)
        .order('data_vencimento').order('id').range(from, to)),
    fetchAll<{ id: string; descricao: string | null; valor: number | null; data_pagamento: string | null }>((from, to) =>
      supabase.from('lancamentos')
        .select('id, descricao, valor, data_pagamento')
        .eq('tipo', 'receber').eq('categoria', 'Particular').eq('status', 'pago')
        .gte('data_pagamento', iniTs).lt('data_pagamento', fimTs)
        .order('data_pagamento', { ascending: false }).order('id').range(from, to)),
    fetchAll<{ id: string; descricao: string | null; valor: number | null; valor_pago: number | null; data_vencimento: string | null }>((from, to) =>
      supabase.from('lancamentos')
        .select('id, descricao, valor, valor_pago, data_vencimento')
        .eq('tipo', 'pagar').eq('categoria', 'Particular').eq('status', 'pendente')
        .order('data_vencimento').order('id').range(from, to)),
    fetchAll<{ id: string; descricao: string | null; valor: number | null; valor_pago: number | null; status: string | null; categoria: string | null; data_pagamento: string | null }>((from, to) =>
      supabase.from('lancamentos')
        .select('id, descricao, valor, valor_pago, status, categoria, data_pagamento')
        .eq('status', 'pago').in('categoria', ['Particular'])
        .gte('data_pagamento', iniTs).lt('data_pagamento', fimTs)
        .order('data_pagamento', { ascending: false }).order('id').range(from, to)),
    supabase.from('metas_poupanca').select('id, nome, cor, atual, objetivo, escopo')
      .eq('ativo', true).eq('escopo', 'pessoal').order('nome'),
    supabase.from('aportes_poupanca').select('valor, criado_em, metas_poupanca!inner(escopo)')
      .eq('metas_poupanca.escopo', 'pessoal').gte('criado_em', iniTs).lt('criado_em', fimTs),
  ])

  const r = resumoParticular(linhas as { categoria: string | null; valor?: number | null; valor_pago?: number | null; status?: string | null }[])
  const entradasExtras = entradasP.reduce((t, e) => t + Number(e.valor ?? 0), 0)
  const entrou = r.proLaborePrevisto + entradasExtras
  const saiu = r.particularPago
  const sobrou = entrou - saiu
  const guardadoNoMes = (aportes.data ?? []).reduce((t, a) => t + Number((a as { valor?: number }).valor ?? 0), 0)
  const disponivelPotes = Math.round((sobrou - guardadoNoMes) * 100) / 100
  const maxBarra = Math.max(entrou, saiu, 1)

  const potes = (potesRes.data ?? []) as { id: string; nome: string; cor: string | null; atual: number | null; objetivo: number | null; escopo: string | null }[]
  const migracaoPendente = !!potesRes.error

  // Últimas 5: contas particulares pagas + entradas anotadas, por data.
  const movs = [
    ...recentes.filter((x) => x.status === 'pago').map((x) => ({ id: x.id, nome: x.descricao ?? 'Conta particular', data: x.data_pagamento, valor: Number(x.valor ?? 0), entrada: false })),
    ...entradasP.map((x) => ({ id: x.id, nome: x.descricao ?? 'Entrada particular', data: x.data_pagamento, valor: Number(x.valor ?? 0), entrada: true })),
  ].sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? ''))).slice(0, 5)

  const Nav = ({ href, ativo, children }: { href: string; ativo: boolean; children: ReactNode }) => (
    <Link href={href} aria-current={ativo ? 'page' : undefined}
      className={`${NAV} ${ativo ? 'border-[#2B2350] bg-[#FFC93C]' : 'border-transparent hover:bg-[#FFF1D6]'}`}>
      {children}
    </Link>
  )

  return (
    <div className="min-h-screen text-[#2B2350]" style={{ background: BG, fontFamily: "Nunito, system-ui, sans-serif" }}>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800;900&display=swap" />

      <div className="flex min-h-screen flex-wrap">
        {/* Barra lateral */}
        <aside className="flex flex-col gap-2.5 border-r-[3px] border-[#2B2350] bg-white px-4 py-5 lg:w-[250px] lg:shrink-0">
          <div className="flex items-center gap-2.5 px-2 pb-3.5 text-xl font-black">
            <span aria-hidden className="inline-block h-[30px] w-[30px] rounded-[9px] border-[3px] border-[#2B2350] bg-[#FFC93C]" />
            TecnoCell
          </div>
          <Nav href="/painel/particular" ativo={aba === 'inicio'}>Início</Nav>
          <Nav href="/painel/particular?aba=potinhos" ativo={aba === 'potinhos'}>Meus potinhos</Nav>
          <Nav href="/painel/particular?aba=anotar" ativo={aba === 'anotar'}>Anotar dinheiro</Nav>
          <Link href="/painel" className="mt-1 px-3.5 text-[13px] font-bold underline-offset-2 hover:underline" style={{ color: SEC }}>
            ← Voltar ao sistema
          </Link>

          <div className={`${CARD} mt-auto p-3.5`} style={{ background: LILAC }}>
            <b className="text-[16px]">Dica da Moedinha</b>
            <div className="mt-1 text-[14px] font-semibold" style={{ color: INK }}>
              Aperte em “Paguei!” ou “Recebi!” e veja o saldo mudar na hora.
            </div>
          </div>
        </aside>

        {/* Conteúdo */}
        <main className="min-w-0 flex-[999_1_560px] p-5 lg:p-7">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-[26px] font-black leading-tight">
                  {aba === 'potinhos' ? 'Meus potinhos' : aba === 'anotar' ? 'Anotar dinheiro' : 'Oi! Veja como está o seu dinheiro hoje.'}
                </h1>
                <div role="status" className="mt-1 text-[15px] font-semibold" style={{ color: SEC }}>
                  {params.msg ?? (aba === 'potinhos' ? 'Cada potinho guarda dinheiro para uma coisa.' : `Particular do mês · ${new Date(de + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long' })}`)}
                </div>
              </div>
              <Link href="/painel/particular?aba=anotar" className={`${BTN} bg-[#FFC93C]`}>+ Anotar dinheiro</Link>
            </div>

            {migracaoPendente && (
              <div className={`${CARD} p-4 text-[14px] font-semibold`} style={{ background: LILAC }}>
                Meus potinhos ainda não funcionam: falta aplicar a migração <b>2026-11-25-metas-poupanca-escopo.sql</b> no SQL Editor do Supabase.
              </div>
            )}

            {aba === 'inicio' && (
              <>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                  <div className={`${CARD} flex flex-col gap-2 p-4`}>
                    <span className="text-[14px] font-bold" style={{ color: SEC }}>Tenho agora</span>
                    <span className="text-[30px] font-black leading-[1.1] tracking-[-0.02em] tabular-nums">{brl(sobrou)}</span>
                    <span className="text-[13px] font-semibold" style={{ color: SEC }}>pró-labore − contas pagas</span>
                  </div>
                  <div className={`${CARD} flex flex-col gap-2 p-4`} style={{ background: MINT }}>
                    <span aria-hidden className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border-[3px] border-[#2B2350] bg-white text-[18px] font-black">↓</span>
                    <span className="text-[14px] font-extrabold">Entrou</span>
                    <span className="text-[30px] font-black leading-[1.1] tracking-[-0.02em] tabular-nums">{brl(entrou)}</span>
                  </div>
                  <div className={`${CARD} flex flex-col gap-2 p-4`} style={{ background: CORAL }}>
                    <span aria-hidden className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border-[3px] border-[#2B2350] bg-white text-[18px] font-black">↑</span>
                    <span className="text-[14px] font-extrabold">Saiu</span>
                    <span className="text-[30px] font-black leading-[1.1] tracking-[-0.02em] tabular-nums">{brl(saiu)}</span>
                  </div>
                  <div className={`${CARD} flex flex-col gap-2 p-4`} style={{ background: BLUE }}>
                    <span aria-hidden className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border-[3px] border-[#2B2350] bg-white text-[18px] font-black">+</span>
                    <span className="text-[14px] font-extrabold">Sobrou</span>
                    <span className="text-[30px] font-black leading-[1.1] tracking-[-0.02em] tabular-nums">{brl(sobrou)}</span>
                  </div>
                </div>

                <div className="grid items-start gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
                  <div className={`${CARD} p-5`}>
                    <h2 className="mb-2 text-[19px] font-black">Não esqueça!</h2>
                    {aVencer.length === 0 ? (
                      <p className="text-[15px] font-semibold" style={{ color: SEC }}>Nada em aberto. Tudo pago!</p>
                    ) : aVencer.slice(0, 6).map((c, i) => (
                      <div key={c.id} className="flex items-center gap-3 py-3" style={i === 0 ? undefined : { borderTop: `2px solid ${LINE}` }}>
                        <span aria-hidden className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[12px] border-[3px] border-[#2B2350] bg-[#FFE3E0] text-[16px] font-black">↑</span>
                        <div className="flex-1">
                          <div className="text-[14px] font-bold" style={{ color: SEC }}>Pagar · {diaCurto(c.data_vencimento)}</div>
                          <div className="text-[17px] font-black">{(c.descricao ?? 'Conta').trim()}</div>
                        </div>
                        <div className="text-[17px] font-black tabular-nums">{brl(Math.max(0, Number(c.valor ?? 0) - Number(c.valor_pago ?? 0)))}</div>
                        <form action={pagarParticular.bind(null, c.id)}>
                          <button type="submit" className={`${BTN} bg-[#FFC93C]`}>Paguei!</button>
                        </form>
                      </div>
                    ))}
                  </div>

                  <div className={`${CARD} flex flex-col gap-3 p-5`}>
                    <h2 className="text-[19px] font-black">Entrou ou saiu mais?</h2>
                    {[{ rotulo: 'Entrou', valor: entrou, cor: MINT }, { rotulo: 'Saiu', valor: saiu, cor: CORAL }].map((b) => (
                      <div key={b.rotulo}>
                        <div className="text-[14px] font-bold" style={{ color: SEC }}>{b.rotulo} · <b className="tabular-nums">{brl(b.valor)}</b></div>
                        <div className="mt-1 h-[14px] overflow-hidden rounded-[7px] border-[3px] border-[#2B2350]" style={{ background: BG }}>
                          <div className="h-full transition-[width] duration-300" style={{ width: `${Math.min(100, (b.valor / maxBarra) * 100)}%`, background: b.cor }} />
                        </div>
                      </div>
                    ))}
                    <h2 className="mt-1.5 text-[19px] font-black">O que aconteceu</h2>
                    {movs.length === 0 ? (
                      <p className="text-[15px] font-semibold" style={{ color: SEC }}>Nada anotado neste mês ainda.</p>
                    ) : movs.map((mv, i) => (
                      <div key={mv.id} className="flex items-center gap-3 py-3" style={i === 0 ? undefined : { borderTop: `2px solid ${LINE}` }}>
                        <div className="flex-1">
                          <div className="text-[17px] font-black">{mv.nome.trim()}</div>
                          <div className="text-[14px] font-bold" style={{ color: SEC }}>{diaCurto(mv.data)}</div>
                        </div>
                        <div className="text-[17px] font-black tabular-nums" style={{ color: mv.entrada ? '#0B5E4D' : '#B42318' }}>
                          {mv.entrada ? '+ ' : '− '}{formatBRL(mv.valor)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {aba === 'potinhos' && (
              <>
                <div className={`${CARD} p-4 text-[15px] font-semibold`} style={{ color: SEC }}>
                  Dá para guardar: <b className="text-[19px] tabular-nums" style={{ color: INK }}>{brl(disponivelPotes)}</b> (o que sobrou do mês menos o que já guardou)
                </div>

                {potes.length === 0 ? (
                  <div className={`${CARD} p-5`}>
                    <p className="text-[15px] font-semibold" style={{ color: SEC }}>
                      {migracaoPendente ? 'Crie o primeiro pote abaixo depois de aplicar a migração.' : 'Nenhum potinho ainda. Crie o primeiro abaixo.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                    {potes.map((p) => {
                      const atual = Number(p.atual ?? 0)
                      const objetivo = Number(p.objetivo ?? 0)
                      const pct = objetivo > 0 ? Math.round((atual / objetivo) * 100) : 0
                      const cheio = atual >= objetivo
                      return (
                        <div key={p.id} className={`${CARD} flex flex-col items-center gap-2 p-4 text-center`}>
                          <Pote cor={p.cor ?? MINT} pct={pct} nome={p.nome} />
                          <span className="text-[18px] font-black">{p.nome}</span>
                          <span className="rounded-full border-[3px] border-[#2B2350] px-3 py-[1px] text-[13px] font-black" style={{ background: BG }}>{pct}% cheio</span>
                          <span className="text-[14px] font-bold" style={{ color: SEC }}>
                            <b className="tabular-nums" style={{ color: INK }}>{brl(atual)}</b> de <b className="tabular-nums" style={{ color: INK }}>{brl(objetivo)}</b>
                          </span>
                          {cheio ? (
                            <span className="mt-1 text-[15px] font-black" style={{ color: '#0B5E4D' }}>Pote cheio!</span>
                          ) : (
                            <form action={guardarNoPote} className="mt-1 w-full">
                              <input type="hidden" name="pote_id" value={p.id} />
                              <input type="hidden" name="valor" value="500" />
                              <button type="submit" className={`${BTN} w-full bg-[#FFC93C]`}>Guardar R$ 500</button>
                            </form>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <form action={criarPote}
                  className={`${CARD} flex flex-wrap items-end gap-3 p-4`}>
                  <div className="min-w-[160px] flex-1">
                    <label htmlFor="nome" className="text-[14px] font-bold" style={{ color: SEC }}>Novo pote</label>
                    <input id="nome" name="nome" placeholder="Viagem, Casa, Emergência…"
                      className="mt-1 h-[46px] w-full rounded-[14px] border-[3px] border-[#2B2350] bg-white px-3 text-[15px] font-bold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]" />
                  </div>
                  <div className="w-[150px]">
                    <label htmlFor="objetivo" className="text-[14px] font-bold" style={{ color: SEC }}>Quero juntar (R$)</label>
                    <input id="objetivo" name="objetivo" inputMode="decimal" placeholder="0,00"
                      className="mt-1 h-[46px] w-full rounded-[14px] border-[3px] border-[#2B2350] bg-white px-3 text-[15px] font-bold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7B6CF6]" />
                  </div>
                  <button type="submit" className={`${BTN} bg-[#2EC4A0]`}>Criar pote</button>
                </form>
              </>
            )}

            {aba === 'anotar' && <AnotarParticular />}
          </div>
        </main>
      </div>
    </div>
  )
}
