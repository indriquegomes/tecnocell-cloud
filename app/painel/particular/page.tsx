import Link from 'next/link'
import type { ReactNode } from 'react'
import { createServiceClient, requirePermissao, fetchAll } from '@/lib/supabase/server'
import { formatBRL, hojeSP } from '@/lib/utils'
import { resumoParticular } from '@/lib/particular'
import { pagarParticular } from './actions'
import { AnotarParticular } from './AnotarParticular'

// ABA PARTICULAR — painel do dono, em tela cheia, com a ESTRUTURA do protótipo
// divertido aprovado e as CORES PADRÃO do app:
//   azul da marca #1B6CA8 (primário/ativo), laranja #F47920 (marca),
//   cinza para texto (gray-900/500/400), emerald/rose para entrada/saída,
//   cartão branco `rounded-2xl border border-gray-200 shadow-sm`.
//
// Régua (lib/particular.ts): pró-labore do mês é o dinheiro reservado; conta
// particular paga sai dele; o que sobra é o que pode ser retirado. Nada aqui é
// despesa da loja.
//

const EMERALD = '#059669'
const ROSE = '#e11d48'
const CARD = 'rounded-2xl border border-gray-200 bg-white shadow-sm'
const BTN_PRIMARIO = 'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#1B6CA8] px-4 text-sm font-semibold text-white transition hover:bg-[#155a8e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B6CA8]'
const BTN_SECUNDARIO = 'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B6CA8]'
const BTN_LARANJA = 'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#F47920] px-4 text-sm font-semibold text-white transition hover:bg-[#d9650f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F47920]'
const BTN_OK = 'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600'
const NAV_BASE = 'flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold transition'

function brl(v: number) {
  return v < 0 ? `−${formatBRL(Math.abs(v))}` : formatBRL(v)
}

function diaCurto(iso: string | null | undefined) {
  const s = (iso ?? '').slice(0, 10)
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
}

export default async function ParticularPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; msg?: string }>
}) {
  await requirePermissao('master')
  const params = await searchParams
  const aba = params.aba === 'anotar' ? 'anotar' : 'inicio'
  const hoje = hojeSP()
  const mesAtual = hoje.slice(0, 7)
  const [ano, m] = mesAtual.split('-').map(Number)
  const de = `${mesAtual}-01`
  const prox = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
  const iniTs = de + 'T00:00:00-03:00'
  const fimTs = prox + 'T00:00:00-03:00'

  const supabase = await createServiceClient()

  const [linhas, entradasP, aVencer, recentes] = await Promise.all([
    fetchAll<{ id: string; descricao: string | null; valor: number | null; valor_pago: number | null; status: string | null; categoria: string | null; data_vencimento: string | null; data_pagamento: string | null }>((from, to) =>
      supabase.from('lancamentos')
        .select('id, descricao, valor, valor_pago, status, categoria, data_vencimento, data_pagamento')
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
    fetchAll<{ id: string; descricao: string | null; valor: number | null; status: string | null; data_pagamento: string | null }>((from, to) =>
      supabase.from('lancamentos')
        .select('id, descricao, valor, status, data_pagamento')
        .eq('tipo', 'pagar').eq('categoria', 'Particular').eq('status', 'pago')
        .gte('data_pagamento', iniTs).lt('data_pagamento', fimTs)
        .order('data_pagamento', { ascending: false }).order('id').range(from, to)),
  ])

  const r = resumoParticular(linhas as { categoria: string | null; valor?: number | null; valor_pago?: number | null; status?: string | null }[])
  const entradasExtras = entradasP.reduce((t, e) => t + Number(e.valor ?? 0), 0)
  const entrou = r.proLaborePrevisto + entradasExtras
  const saiu = r.particularPago
  const sobrou = entrou - saiu
  const maxBarra = Math.max(entrou, saiu, 1)

  const movs = [
    ...recentes.map((x) => ({ id: x.id, nome: x.descricao ?? 'Conta particular', data: x.data_pagamento, valor: Number(x.valor ?? 0), entrada: false })),
    ...entradasP.map((x) => ({ id: x.id, nome: x.descricao ?? 'Entrada particular', data: x.data_pagamento, valor: Number(x.valor ?? 0), entrada: true })),
  ].sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? ''))).slice(0, 5)

  const Nav = ({ href, ativo, children }: { href: string; ativo: boolean; children: ReactNode }) => (
    <Link href={href} aria-current={ativo ? 'page' : undefined}
      className={`${NAV_BASE} ${ativo ? 'bg-[#1B6CA8] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
      {children}
    </Link>
  )

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="flex min-h-screen flex-wrap">
        {/* Barra lateral — padrão do app */}
        <aside className="flex flex-col gap-2 border-r border-gray-200 bg-white px-4 py-5 lg:w-[250px] lg:shrink-0">
          <div className="flex items-center gap-2.5 px-2 pb-3.5 text-lg font-bold text-gray-900">
            <span aria-hidden className="inline-block h-[30px] w-[30px] rounded-lg bg-[#1B6CA8]" />
            TecnoCell
          </div>
          <Nav href="/painel/particular" ativo={aba === 'inicio'}>Início</Nav>
          <Nav href="/painel/particular?aba=anotar" ativo={aba === 'anotar'}>Anotar dinheiro</Nav>
          <Link href="/painel" className="mt-1 px-3 text-sm font-medium text-gray-400 underline-offset-2 hover:underline">
            ← Voltar ao sistema
          </Link>

          <div className="mt-auto rounded-2xl border border-orange-200 bg-orange-50 p-3.5">
            <p className="text-sm font-bold text-[#F47920]">Dica da Moedinha</p>
            <p className="mt-1 text-xs leading-snug text-orange-900">Aperte em “Paguei!” ou “Recebi!” e veja o saldo mudar na hora.</p>
          </div>
        </aside>

        {/* Conteúdo */}
        <main className="min-w-0 flex-[999_1_560px] p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {aba === 'anotar' ? 'Anotar dinheiro' : 'Particular do Dono'}
                </h1>
                {(params.msg || aba === 'inicio') && (
                  <p role="status" className="mt-0.5 text-sm text-gray-500">
                    {params.msg ?? 'As contas da sua vida, pagas com o pró-labore — o que sobra é o que dá para retirar.'}
                  </p>
                )}
              </div>
              <Link href="/painel/particular?aba=anotar" className={BTN_LARANJA}>+ Anotar dinheiro</Link>
            </div>

            {aba === 'inicio' && (
              <>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                  <div className="rounded-2xl bg-[#1B6CA8] p-4 text-white shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Tenho agora</p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums">{brl(sobrou)}</p>
                    <p className="mt-1 text-xs text-white/70">pró-labore − contas pagas</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-500 p-4 text-white shadow-sm">
                    <div className="flex items-start justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Entrou</p>
                      <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white">↓</span>
                    </div>
                    <p className="mt-1 text-3xl font-semibold tabular-nums">{brl(entrou)}</p>
                    <p className="mt-1 text-xs text-white/70">pró-labore do mês</p>
                  </div>
                  <div className="rounded-2xl bg-rose-500 p-4 text-white shadow-sm">
                    <div className="flex items-start justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Saiu</p>
                      <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white">↑</span>
                    </div>
                    <p className="mt-1 text-3xl font-semibold tabular-nums">{brl(saiu)}</p>
                    <p className="mt-1 text-xs text-white/70">contas particulares pagas</p>
                  </div>
                  <div className="rounded-2xl bg-sky-500 p-4 text-white shadow-sm">
                    <div className="flex items-start justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Sobrou</p>
                      <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white">+</span>
                    </div>
                    <p className="mt-1 text-3xl font-semibold tabular-nums">{brl(sobrou)}</p>
                    <p className="mt-1 text-xs text-white/70">Entrou − Saiu</p>
                  </div>
                </div>

                <div className="grid items-start gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
                  <div className={`${CARD} p-5`}>
                    <h2 className="mb-2 text-sm font-semibold text-gray-800">Não esqueça!</h2>
                    {aVencer.length === 0 ? (
                      <p className="text-sm text-gray-400">Nada em aberto. Tudo pago!</p>
                    ) : aVencer.slice(0, 6).map((c, i) => (
                      <div key={c.id} className="flex flex-wrap items-center gap-3 py-3" style={i === 0 ? undefined : { borderTop: '1px solid #f3f4f6' }}>
                        <span aria-hidden className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-rose-50 text-rose-500">↑</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-gray-400">Pagar · {diaCurto(c.data_vencimento)}</div>
                          <div className="truncate text-sm font-semibold text-gray-800">{(c.descricao ?? 'Conta').trim()}</div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums text-gray-900">{brl(Math.max(0, Number(c.valor ?? 0) - Number(c.valor_pago ?? 0)))}</div>
                        <form action={pagarParticular.bind(null, c.id)}>
                          <button type="submit" className={BTN_OK}>Paguei!</button>
                        </form>
                      </div>
                    ))}
                  </div>

                  <div className={`${CARD} flex flex-col gap-3 p-5`}>
                    <h2 className="text-sm font-semibold text-gray-800">Entrou ou saiu mais?</h2>
                    {[{ rotulo: 'Entrou', valor: entrou, cor: EMERALD }, { rotulo: 'Saiu', valor: saiu, cor: ROSE }].map((b) => (
                      <div key={b.rotulo}>
                        <div className="text-sm font-medium text-gray-500">{b.rotulo} · <b className="tabular-nums text-gray-800">{brl(b.valor)}</b></div>
                        <div className="mt-1 h-3.5 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full transition-[width] duration-300" style={{ width: `${Math.min(100, (b.valor / maxBarra) * 100)}%`, background: b.cor }} />
                        </div>
                      </div>
                    ))}
                    <h2 className="mt-1.5 text-sm font-semibold text-gray-800">O que aconteceu</h2>
                    {movs.length === 0 ? (
                      <p className="text-sm text-gray-400">Nada anotado neste mês ainda.</p>
                    ) : movs.map((mv, i) => (
                      <div key={mv.id} className="flex items-center gap-3 py-2.5" style={i === 0 ? undefined : { borderTop: '1px solid #f3f4f6' }}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-gray-800">{mv.nome.trim()}</div>
                          <div className="text-xs text-gray-400">{diaCurto(mv.data)}</div>
                        </div>
                        <div className={`text-sm font-semibold tabular-nums ${mv.entrada ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {mv.entrada ? '+ ' : '− '}{formatBRL(mv.valor)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {aba === 'anotar' && <AnotarParticular />}
          </div>
        </main>
      </div>
    </div>
  )
}
