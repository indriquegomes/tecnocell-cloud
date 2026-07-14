'use client'

import { useActionState, useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/Spinner'
import { createClient } from '@/lib/supabase/client'
import { salvarEscalaDia, salvarExcecao, salvarRegua, removerExcecao, type ActionState } from './actions'
import {
  DIAS, HORARIO_LOJA, horarioDoDia, hhmm, min, horasTexto, DIA_INICIO, DIA_FIM,
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

// paleta estável por pessoa — mas a cor SALVA no cadastro ("a Bruna é rosinha")
// vence a paleta. cores vem de perfis.cor_escala.
const CORES = ['#1B6CA8', '#F47920', '#16a34a', '#9333ea', '#0891b2', '#db2777', '#ca8a04', '#4f46e5']
const corDe = (id: string, perfis: Pessoa[], cores?: Record<string, string | null>) =>
  cores?.[id] || CORES[perfis.findIndex((p) => p.id === id) % CORES.length]

export function EscalaClient({
  dias, perfis, cores, escalas, excecoes, lojas, horas, semanaAtual,
}: {
  dias: DiaGrade[]
  perfis: Pessoa[]
  cores: Record<string, string | null>
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
            {dias.map((d) => <DiaLinha key={d.data} dia={d} perfis={perfis} cores={cores} fmtDiaData={fmtDiaData} />)}
          </div>

          {/* horas da semana */}
          {horas.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-gray-800">Horas na semana</p>
              <div className="space-y-1.5">
                {horas.map((h) => (
                  <div key={h.perfilId} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDe(h.perfilId, perfis, cores) }} />
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
function DiaLinha({ dia, perfis, cores, fmtDiaData }: { dia: DiaGrade; perfis: Pessoa[]; cores: Record<string, string | null>; fmtDiaData: (d: string) => string }) {
  const h = horarioDoDia(dia.diaSemana)
  const ativos = dia.turnos.filter((t) => !t.folga && t.saida > t.entrada)
  const [editando, setEditando] = useState(false)

  if (!h) return null   // domingo: loja fechada

  // A régua cobre o DIA TODO (00:00–24:00). O expediente da loja é só uma faixa
  // sombreada dentro dela — assim dá pra escalar quem chega 06h pra abrir ou quem
  // fica depois das 19h fechando o caixa.
  const abre = min(h.abre)
  const fecha = min(h.fecha)
  const span = DIA_FIM - DIA_INICIO
  const pos = (m: number) => `${((m - DIA_INICIO) / span) * 100}%`
  const larg = (a: number, b: number) => `${((Math.min(b, DIA_FIM) - Math.max(a, DIA_INICIO)) / span) * 100}%`

  // marcas de hora no eixo (de 3 em 3 pra caber as 24h)
  const marcas: number[] = []
  for (let m = DIA_INICIO; m <= DIA_FIM; m += 180) marcas.push(m)

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${dia.furos.length ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-bold text-gray-800">
          {DIAS[dia.diaSemana]} <span className="font-normal text-gray-400">{fmtDiaData(dia.data)}</span>
        </p>
        <div className="flex items-center gap-3">
          {dia.furos.length > 0
            ? <span className="text-xs font-semibold text-red-600">🔴 sem ninguém {dia.furos.map((f) => `${hhmm(f.de)}–${hhmm(f.ate)}`).join(', ')}</span>
            : ativos.length === 0
              ? <span className="text-xs text-gray-400">ninguém escalado</span>
              : <span className="text-xs text-emerald-600">✓ coberto</span>}
          <button type="button" onClick={() => setEditando((v) => !v)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${editando ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-700'}`}>
            {editando ? 'fechar' : '✎ Escalar'}
          </button>
        </div>
      </div>

      {/* trilho */}
      <div className="relative">
        {/* eixo de horas */}
        <div className="relative mb-1 h-4">
          {marcas.map((m) => (
            <span key={m} className="absolute -translate-x-1/2 text-[10px] text-gray-400" style={{ left: pos(m) }}>{hhmm(m)}</span>
          ))}
        </div>

        {/* faixa de cada pessoa — o fundo mostra o EXPEDIENTE (resto do dia é cinza) */}
        <div className="space-y-1.5">
          {ativos.length === 0 && (
            <div className="relative h-7 overflow-hidden rounded-lg bg-gray-100">
              <div className="absolute inset-y-0 flex items-center justify-center bg-red-50 text-[11px] font-medium text-red-500"
                style={{ left: pos(abre), width: larg(abre, fecha) }}>
                Loja aberta e ninguém escalado
              </div>
            </div>
          )}
          {ativos.map((t) => {
            const cor = corDe(t.perfilId, perfis, cores)
            const temPausa = t.pausaIni !== null && t.pausaFim !== null && t.pausaFim > t.pausaIni
            const rotulo = `${t.nome}: ${hhmm(t.entrada)}–${hhmm(t.saida)}${temPausa ? ` (almoço ${hhmm(t.pausaIni!)}–${hhmm(t.pausaFim!)})` : ''}${t.alterado ? ' ✎' : ''}`
            return (
              <div key={t.perfilId} className="relative h-7 overflow-hidden rounded-lg bg-gray-100" title={rotulo}>
                {temPausa ? (
                  <>
                    <div className="absolute inset-y-0 flex items-center rounded-l-lg px-2 text-xs font-semibold text-white"
                      style={{ left: pos(t.entrada), width: larg(t.entrada, t.pausaIni!), background: cor }}>
                      <span className="truncate">{t.nome} · {hhmm(t.entrada)}–{hhmm(t.saida)}{t.alterado ? ' ✎' : ''}</span>
                    </div>
                    {/* almoço: trecho vazado — a pessoa NÃO está na loja nesse pedaço */}
                    <div className="absolute inset-y-0 flex items-center justify-center text-[9px]"
                      style={{ left: pos(t.pausaIni!), width: larg(t.pausaIni!, t.pausaFim!), background: `repeating-linear-gradient(45deg, #fff, #fff 4px, ${cor}33 4px, ${cor}33 8px)` }}>
                      🍽
                    </div>
                    <div className="absolute inset-y-0 rounded-r-lg"
                      style={{ left: pos(t.pausaFim!), width: larg(t.pausaFim!, t.saida), background: cor }} />
                  </>
                ) : (
                  <div className="absolute inset-y-0 flex items-center rounded-lg px-2 text-xs font-semibold text-white"
                    style={{ left: pos(t.entrada), width: larg(t.entrada, t.saida), background: cor }}>
                    <span className="truncate">{t.nome} · {hhmm(t.entrada)}–{hhmm(t.saida)}{t.alterado ? ' ✎' : ''}</span>
                  </div>
                )}
              </div>
            )
          })}
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

      {editando && (
        <ReguaEditor dia={dia} perfis={perfis} cores={cores} abre={abre} fecha={fecha} onFechar={() => setEditando(false)} />
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

// ── RÉGUA — edita a escala ARRASTANDO na linha do tempo (pedido do Vitor) ─────
// Escolhe a pessoa (chip com a cor dela), arrasta as duas pontas do turno e as duas
// do almoço, salva como rotina ("toda Seg") ou só naquele dia. Pointer events puros:
// funciona com mouse E com o dedo no tablet. Passo de 15 minutos.
function ReguaEditor({
  dia, perfis, cores, abre, fecha, onFechar,
}: {
  dia: DiaGrade
  perfis: Pessoa[]
  cores: Record<string, string | null>
  abre: number
  fecha: number
  onFechar: () => void
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState<ActionState, FormData>(salvarRegua, null)
  const [pessoa, setPessoa] = useState(perfis[0]?.id ?? '')
  const [cor, setCor] = useState(corDe(perfis[0]?.id ?? '', perfis, cores))
  const [ent, setEnt] = useState(abre)
  const [sai, setSai] = useState(fecha)
  const [comAlmoco, setComAlmoco] = useState(true)
  const [p1, setP1] = useState(12 * 60)
  const [p2, setP2] = useState(13 * 60)
  const trilhoRef = useRef<HTMLDivElement>(null)
  const arrastando = useRef<null | 'ent' | 'sai' | 'p1' | 'p2'>(null)

  // trocar de pessoa: puxa o turno atual dela nesse dia (se existir) e a cor dela
  const escolher = (id: string) => {
    setPessoa(id)
    setCor(corDe(id, perfis, cores))
    const t = dia.turnos.find((x) => x.perfilId === id && !x.folga)
    if (t) {
      setEnt(t.entrada); setSai(t.saida)
      if (t.pausaIni !== null && t.pausaFim !== null) { setComAlmoco(true); setP1(t.pausaIni); setP2(t.pausaFim) }
      else setComAlmoco(false)
    } else {
      setEnt(abre); setSai(fecha); setComAlmoco(true); setP1(12 * 60); setP2(13 * 60)
    }
  }

  // pointer → minuto (preso ao trilho de 24h, passo 15min)
  const minutoDoEvento = (clientX: number) => {
    const r = trilhoRef.current?.getBoundingClientRect()
    if (!r) return DIA_INICIO
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    return Math.round((DIA_INICIO + f * (DIA_FIM - DIA_INICIO)) / 15) * 15
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!arrastando.current) return
      const m = minutoDoEvento(e.clientX)
      if (arrastando.current === 'ent') setEnt(Math.max(DIA_INICIO, Math.min(m, sai - 15)))
      if (arrastando.current === 'sai') setSai(Math.min(DIA_FIM, Math.max(m, ent + 15)))
      if (arrastando.current === 'p1') setP1(Math.max(ent + 15, Math.min(m, p2 - 15)))
      if (arrastando.current === 'p2') setP2(Math.min(sai - 15, Math.max(m, p1 + 15)))
    }
    const up = () => { arrastando.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ent, sai, p1, p2])

  useEffect(() => { if (state?.ok) router.refresh() }, [state, router])

  // trilho = DIA TODO (00:00–24:00); a loja é só a faixa sombreada dentro dele
  const span = DIA_FIM - DIA_INICIO
  const pos = (m: number) => `${((m - DIA_INICIO) / span) * 100}%`
  const larg = (a: number, b: number) => `${((b - a) / span) * 100}%`

  const Handle = ({ m, tipo, rotulo }: { m: number; tipo: 'ent' | 'sai' | 'p1' | 'p2'; rotulo: string }) => (
    <button
      type="button"
      aria-label={rotulo}
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); arrastando.current = tipo }}
      className={`absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-2 bg-white shadow ${tipo === 'p1' || tipo === 'p2' ? 'h-5 w-5 border-gray-400' : 'h-7 w-7'}`}
      style={{ left: pos(m), borderColor: tipo === 'p1' || tipo === 'p2' ? undefined : cor }}
    />
  )

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      {/* pessoa (chip com a cor dela) + cor editável — "a Bruna é rosinha" */}
      <div className="flex flex-wrap items-center gap-2">
        {perfis.map((pf) => {
          const c = pf.id === pessoa ? cor : corDe(pf.id, perfis, cores)
          const on = pf.id === pessoa
          return (
            <button key={pf.id} type="button" onClick={() => escolher(pf.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? 'border-transparent text-white shadow' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
              style={on ? { background: c } : undefined}>
              <span className="h-2 w-2 rounded-full" style={{ background: on ? '#fff' : c }} />
              {pf.nome.split(' ')[0]}
            </button>
          )
        })}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
          cor
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border border-gray-200 bg-white p-0.5" />
        </label>
      </div>

      {/* a régua: DIA TODO, com o expediente sombreado. Turno com 2 pontas + almoço. */}
      <div className="px-3 pt-5 pb-1">
        {/* eixo de 24h */}
        <div className="relative mb-1 h-3">
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hr) => (
            <span key={hr} className="absolute -translate-x-1/2 text-[9px] text-gray-400" style={{ left: pos(hr * 60) }}>
              {String(hr).padStart(2, '0')}h
            </span>
          ))}
        </div>
        <div ref={trilhoRef} className="relative h-8 touch-none select-none overflow-hidden rounded-lg bg-gray-200/70">
          {/* expediente da loja — fora dele a escala é possível, só não gera furo */}
          <div className="absolute inset-y-0 bg-white/70" style={{ left: pos(abre), width: larg(abre, fecha) }} />
          <div className="absolute inset-y-0 rounded-lg opacity-90" style={{ left: pos(ent), width: larg(ent, sai), background: cor }} />
          {comAlmoco && (
            <div className="absolute inset-y-0 flex items-center justify-center text-[10px]"
              style={{ left: pos(p1), width: larg(p1, p2), background: 'repeating-linear-gradient(45deg, #fff, #fff 4px, #e5e7eb 4px, #e5e7eb 8px)' }}>
              🍽
            </div>
          )}
          <Handle m={ent} tipo="ent" rotulo="Entrada" />
          <Handle m={sai} tipo="sai" rotulo="Saída" />
          {comAlmoco && <Handle m={p1} tipo="p1" rotulo="Início do almoço" />}
          {comAlmoco && <Handle m={p2} tipo="p2" rotulo="Fim do almoço" />}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold tabular-nums" style={{ color: cor }}>
            {hhmm(ent)} → {hhmm(sai)}
            <span className="ml-2 font-normal text-gray-400">loja {hhmm(abre)}–{hhmm(fecha)}</span>
          </span>
          <label className="flex items-center gap-1.5 text-gray-500">
            <input type="checkbox" checked={comAlmoco} onChange={(e) => setComAlmoco(e.target.checked)} className="rounded" />
            almoço/lanche {comAlmoco && <b className="tabular-nums text-gray-700">{hhmm(p1)}–{hhmm(p2)}</b>}
          </label>
        </div>
      </div>

      {/* salvar: rotina ou só este dia */}
      <form action={withToken(action)} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="perfil_id" value={pessoa} />
        <input type="hidden" name="dia" value={dia.diaSemana} />
        <input type="hidden" name="data" value={dia.data} />
        <input type="hidden" name="entrada" value={hhmm(ent)} />
        <input type="hidden" name="saida" value={hhmm(sai)} />
        <input type="hidden" name="pausa_inicio" value={comAlmoco ? hhmm(p1) : ''} />
        <input type="hidden" name="pausa_fim" value={comAlmoco ? hhmm(p2) : ''} />
        <input type="hidden" name="cor" value={cor} />
        <button type="submit" name="escopo" value="padrao" disabled={pending}
          className="rounded-xl bg-[#1B6CA8] px-4 py-2 text-xs font-bold text-white hover:bg-[#155a8c] transition disabled:opacity-50">
          Salvar como toda {DIAS[dia.diaSemana]}
        </button>
        {/* mesma régua em seg→sáb de uma vez — quem tem o mesmo horário todo dia
            (que é a maioria) não precisa repetir 6 vezes */}
        <button type="submit" name="escopo" value="todos" disabled={pending}
          onClick={(e) => { if (!confirm(`Aplicar ${hhmm(ent)}–${hhmm(sai)} de SEGUNDA a SÁBADO?\n\nIsso substitui a escala atual desta pessoa em todos esses dias.`)) e.preventDefault() }}
          className="rounded-xl bg-[#F47920] px-4 py-2 text-xs font-bold text-white hover:bg-[#d9660f] transition disabled:opacity-50">
          Aplicar em todos os dias
        </button>
        <button type="submit" name="escopo" value="dia" disabled={pending}
          className="rounded-xl border border-[#1B6CA8] bg-white px-4 py-2 text-xs font-bold text-[#1B6CA8] hover:bg-blue-50 transition disabled:opacity-50">
          Só {dia.data.slice(8, 10)}/{dia.data.slice(5, 7)}
        </button>
        {pending && <Spinner className="h-3.5 w-3.5" />}
        {state && <span className={`text-xs font-medium ${state.ok ? 'text-green-600' : 'text-red-600'}`}>{state.ok ? '✓ ' + state.message : '✗ ' + state.message}</span>}
        <button type="button" onClick={onFechar} className="ml-auto text-xs text-gray-400 hover:text-gray-600">fechar</button>
      </form>
    </div>
  )
}

