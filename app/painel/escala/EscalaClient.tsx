'use client'

import { useActionState, useState, useEffect, useMemo } from 'react'
import { Spinner } from '@/components/Spinner'
import { createClient } from '@/lib/supabase/client'
import { salvarEscalaDia, salvarExcecao, removerExcecao, type ActionState } from './actions'
import {
  DIAS, HORARIO_LOJA, horarioDoDia, hhmm, min, horasTexto,
  type Escala, type Excecao, type Turno,
} from '@/lib/escala'

const supabaseBrowser = createClient()
let tokenCache = ''
function withToken(action: (fd: FormData) => void) {
  return (fd: FormData) => { fd.set('access_token', tokenCache); action(fd) }
}

interface Pessoa { id: string; nome: string }
interface DiaGrade {
  data: string
  diaSemana: number
  turnos: Turno[]
  furos: { de: number; ate: number }[]
}

// paleta estável por pessoa (cor da barra na linha do tempo)
const CORES = ['#1B6CA8', '#F47920', '#16a34a', '#9333ea', '#0891b2', '#db2777', '#ca8a04', '#4f46e5']
const corDe = (id: string, perfis: Pessoa[]) => CORES[perfis.findIndex((p) => p.id === id) % CORES.length]

export function EscalaClient({
  dias, perfis, escalas, excecoes, lojas, horas, semanaAtual,
}: {
  dias: DiaGrade[]
  perfis: Pessoa[]
  escalas: Escala[]
  excecoes: Excecao[]
  lojas: { id: string; nome: string }[]
  horas: { perfilId: string; nome: string; minutos: number; dias: number }[]
  semanaAtual: string
}) {
  const [aba, setAba] = useState<'semana' | 'padrao'>('semana')
  useEffect(() => { supabaseBrowser.auth.getSession().then(({ data }) => { tokenCache = data.session?.access_token ?? '' }) }, [])

  const fmtDiaData = (data: string) => {
    const [, m, d] = data.split('-')
    return `${d}/${m}`
  }

  const irSemana = (delta: number) => {
    const d = new Date(`${semanaAtual}T12:00:00-03:00`)
    d.setDate(d.getDate() + delta * 7)
    const s = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    window.location.href = `/painel/escala?semana=${s}`
  }

  const totalFuros = dias.reduce((s, d) => s + d.furos.length, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Escala</h2>
        <div className="ml-auto flex rounded-xl border border-gray-200 bg-white p-0.5 text-sm">
          <button onClick={() => setAba('semana')} className={`rounded-lg px-3 py-1.5 font-medium transition ${aba === 'semana' ? 'bg-[#1B6CA8] text-white' : 'text-gray-500'}`}>Semana</button>
          <button onClick={() => setAba('padrao')} className={`rounded-lg px-3 py-1.5 font-medium transition ${aba === 'padrao' ? 'bg-[#1B6CA8] text-white' : 'text-gray-500'}`}>Escala padrão</button>
        </div>
      </div>

      {aba === 'semana' ? (
        <>
          {/* navegação da semana */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
            <button onClick={() => irSemana(-1)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 transition">← Anterior</button>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-800">{fmtDiaData(dias[0].data)} — {fmtDiaData(dias[dias.length - 1].data)}</p>
              {totalFuros > 0
                ? <p className="text-xs font-semibold text-red-600">🔴 {totalFuros} furo{totalFuros > 1 ? 's' : ''} de cobertura</p>
                : <p className="text-xs text-emerald-600">✓ semana coberta</p>}
            </div>
            <button onClick={() => irSemana(1)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 transition">Próxima →</button>
          </div>

          {/* linha do tempo, um dia por bloco */}
          <div className="space-y-3">
            {dias.map((d) => <DiaLinha key={d.data} dia={d} perfis={perfis} fmtDiaData={fmtDiaData} />)}
          </div>

          {/* horas da semana */}
          {horas.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-gray-800">Horas na semana</p>
              <div className="space-y-1.5">
                {horas.map((h) => (
                  <div key={h.perfilId} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDe(h.perfilId, perfis) }} />
                    <span className="min-w-0 flex-1 truncate text-gray-700">{h.nome}</span>
                    <span className="text-xs text-gray-400">{h.dias} dia{h.dias !== 1 ? 's' : ''}</span>
                    <span className="w-16 text-right font-bold tabular-nums text-gray-900">{horasTexto(h.minutos)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <AlteracaoForm perfis={perfis} excecoes={excecoes} nomes={Object.fromEntries(perfis.map((p) => [p.id, p.nome]))} />
        </>
      ) : (
        <EscalaPadrao perfis={perfis} escalas={escalas} lojas={lojas} />
      )}
    </div>
  )
}

// ── Um dia na linha do tempo, com as barras e os furos ──────────────────────
function DiaLinha({ dia, perfis, fmtDiaData }: { dia: DiaGrade; perfis: Pessoa[]; fmtDiaData: (d: string) => string }) {
  const h = horarioDoDia(dia.diaSemana)
  const ativos = dia.turnos.filter((t) => !t.folga && t.saida > t.entrada)

  if (!h) return null   // domingo: loja fechada

  const abre = min(h.abre)
  const fecha = min(h.fecha)
  const span = fecha - abre
  const pos = (m: number) => `${((m - abre) / span) * 100}%`
  const larg = (a: number, b: number) => `${((Math.min(b, fecha) - Math.max(a, abre)) / span) * 100}%`

  // marcas de hora no eixo (de 2 em 2)
  const marcas: number[] = []
  for (let m = abre; m <= fecha; m += 120) marcas.push(m)

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${dia.furos.length ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-bold text-gray-800">
          {DIAS[dia.diaSemana]} <span className="font-normal text-gray-400">{fmtDiaData(dia.data)}</span>
        </p>
        {dia.furos.length > 0
          ? <span className="text-xs font-semibold text-red-600">🔴 sem ninguém {dia.furos.map((f) => `${hhmm(f.de)}–${hhmm(f.ate)}`).join(', ')}</span>
          : ativos.length === 0
            ? <span className="text-xs text-gray-400">ninguém escalado</span>
            : <span className="text-xs text-emerald-600">✓ coberto</span>}
      </div>

      {/* trilho */}
      <div className="relative">
        {/* eixo de horas */}
        <div className="relative mb-1 h-4">
          {marcas.map((m) => (
            <span key={m} className="absolute -translate-x-1/2 text-[10px] text-gray-400" style={{ left: pos(m) }}>{hhmm(m)}</span>
          ))}
        </div>

        {/* faixa de cada pessoa */}
        <div className="space-y-1.5">
          {ativos.length === 0 && (
            <div className="relative h-7 overflow-hidden rounded-lg bg-red-50">
              <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-red-500">Loja aberta e ninguém escalado</span>
            </div>
          )}
          {ativos.map((t) => (
            <div key={t.perfilId} className="relative h-7 overflow-hidden rounded-lg bg-gray-100">
              <div
                className="absolute inset-y-0 flex items-center rounded-lg px-2 text-xs font-semibold text-white"
                style={{ left: pos(t.entrada), width: larg(t.entrada, t.saida), background: corDe(t.perfilId, perfis) }}
                title={`${t.nome}: ${hhmm(t.entrada)}–${hhmm(t.saida)}`}
              >
                <span className="truncate">{t.nome} · {hhmm(t.entrada)}–{hhmm(t.saida)}{t.alterado ? ' ✎' : ''}</span>
              </div>
            </div>
          ))}
        </div>

        {/* furos pintados por cima */}
        {dia.furos.map((f, i) => (
          <div key={i} className="pointer-events-none absolute bottom-0 top-5 rounded bg-red-500/10 ring-1 ring-inset ring-red-300"
            style={{ left: pos(f.de), width: larg(f.de, f.ate) }} />
        ))}
      </div>

      {/* folgas do dia (não ocupam trilho, mas é bom ver) */}
      {dia.turnos.filter((t) => t.folga).length > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          Folga: {dia.turnos.filter((t) => t.folga).map((t) => t.nome + (t.motivo ? ` (${t.motivo})` : '')).join(', ')}
        </p>
      )}
    </div>
  )
}

// ── Escala padrão: a rotina de cada pessoa por dia ──────────────────────────
function EscalaPadrao({ perfis, escalas, lojas }: { perfis: Pessoa[]; escalas: Escala[]; lojas: { id: string; nome: string }[] }) {
  const [pessoa, setPessoa] = useState(perfis[0]?.id ?? '')
  const doDia = (dia: number) => escalas.find((e) => e.perfil_id === pessoa && e.dia === dia)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Pessoa</label>
        <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className="field sm:w-72">
          {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <p className="mt-2 text-xs text-gray-400">
          A rotina fixa da semana. Loja abre {HORARIO_LOJA.semana.abre} e fecha {HORARIO_LOJA.semana.fecha} (sábado {HORARIO_LOJA.sabado.fecha}).
          Deixe em branco pra folga. Mudança de um dia específico é feita na aba Semana.
        </p>
      </div>

      {pessoa && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((dia) => (
            <DiaPadraoForm key={`${pessoa}-${dia}`} pessoa={pessoa} dia={dia} atual={doDia(dia)} lojas={lojas} />
          ))}
        </div>
      )}
    </div>
  )
}

function DiaPadraoForm({ pessoa, dia, atual, lojas }: { pessoa: string; dia: number; atual?: Escala; lojas: { id: string; nome: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(salvarEscalaDia, null)
  const [folga, setFolga] = useState(!atual)

  return (
    <form action={withToken(action)} className={`rounded-xl border p-4 ${folga ? 'border-gray-200 bg-gray-50' : 'border-blue-200 bg-white'}`}>
      <input type="hidden" name="perfil_id" value={pessoa} />
      <input type="hidden" name="dia" value={dia} />
      {lojas[0] && <input type="hidden" name="loja_id" value={lojas[0].id} />}

      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">{DIAS[dia]}</span>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="hidden" name="folga" value="0" />
          <input type="checkbox" name="folga" value="1" checked={folga} onChange={(e) => setFolga(e.target.checked)} className="rounded" />
          Folga
        </label>
      </div>

      {!folga && (
        <div className="flex items-center gap-2">
          <input name="entrada" type="time" defaultValue={atual ? hhmm(min(atual.entrada)) : HORARIO_LOJA.semana.abre} className="field text-sm" />
          <span className="text-gray-400">→</span>
          <input name="saida" type="time" defaultValue={atual ? hhmm(min(atual.saida)) : (dia === 6 ? HORARIO_LOJA.sabado.fecha : HORARIO_LOJA.semana.fecha)} className="field text-sm" />
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button type="submit" disabled={pending}
          className="rounded-lg bg-[#1B6CA8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#155a8c] transition disabled:opacity-50">
          {pending ? '...' : 'Salvar'}
        </button>
        {state && <span className={`text-xs ${state.ok ? 'text-green-600' : 'text-red-600'}`}>{state.ok ? '✓' : state.message}</span>}
      </div>
    </form>
  )
}

// ── Alteração de um dia específico (folga, entrar mais tarde) ────────────────
function AlteracaoForm({ perfis, excecoes, nomes }: { perfis: Pessoa[]; excecoes: Excecao[]; nomes: Record<string, string> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(salvarExcecao, null)
  const [, remover] = useActionState<ActionState, FormData>(removerExcecao, null)
  const [folga, setFolga] = useState(false)

  const ordenadas = useMemo(() => [...excecoes].sort((a, b) => a.data.localeCompare(b.data)), [excecoes])

  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-gray-800">Alteração de um dia</h3>
      <p className="mt-0.5 text-xs text-gray-400">A escala varia — aqui você muda um dia específico (folga, entrar mais tarde). Sobrescreve a rotina só naquele dia.</p>

      <form action={withToken(action)} className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Pessoa</label>
          <select name="perfil_id" className="field" required>
            {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Dia</label>
          <input name="data" type="date" required className="field" />
        </div>
        {!folga ? (
          <div className="flex items-end gap-1.5">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Entra</label>
              <input name="entrada" type="time" className="field" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Sai</label>
              <input name="saida" type="time" className="field" />
            </div>
          </div>
        ) : <div />}
        <label className="flex items-center gap-1.5 pb-2 text-sm text-gray-600">
          <input type="hidden" name="folga" value="0" />
          <input type="checkbox" name="folga" value="1" checked={folga} onChange={(e) => setFolga(e.target.checked)} className="rounded" />
          Folga
        </label>
        <div className="sm:col-span-full">
          <input name="motivo" placeholder="Motivo (opcional): médico, cobrindo colega…" className="field" />
        </div>
        <div className="sm:col-span-full">
          <button type="submit" disabled={pending}
            className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition disabled:opacity-50">
            {pending ? 'Salvando...' : 'Salvar alteração'}
          </button>
          {state && <span className={`ml-2 text-sm ${state.ok ? 'text-green-600' : 'text-red-600'}`}>{state.ok ? '✓ ' + state.message : '✗ ' + state.message}</span>}
        </div>
      </form>

      {ordenadas.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-semibold uppercase text-gray-400">Alterações desta semana</p>
          {ordenadas.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5 text-sm">
              <span className="font-medium text-gray-700">{nomes[e.perfil_id] ?? '—'}</span>
              <span className="text-gray-400">{e.data.slice(8, 10)}/{e.data.slice(5, 7)}</span>
              <span className={e.folga ? 'text-purple-600' : 'text-blue-600'}>
                {e.folga ? '🌴 Folga' : `${hhmm(min(e.entrada))}–${hhmm(min(e.saida))}`}
              </span>
              {e.motivo && <span className="truncate text-xs text-gray-400">· {e.motivo}</span>}
              <form action={withToken(remover)} className="ml-auto">
                <input type="hidden" name="id" value={e.id} />
                <button type="submit" className="text-xs text-red-500 hover:text-red-700">remover</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
