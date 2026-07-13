import { formatBRL } from '@/lib/utils'

export type Faixa = { nome: string; valor: number; premio: number }
export type MetaInput = {
  loja: string
  rotulo: string            // ex "Metas de Julho"
  diasUteis: number
  diasDecorridos: number
  faturamento: number       // faturamento real no período
  faturamentoHoje: number   // faturamento de hoje
  pessoas?: number          // quantos dividem a meta (pra mostrar a parte de cada um)
  faixas: Faixa[]           // ordenadas asc por valor
}

// cor decorativa por faixa (só o pontinho/rótulo — o dado é uma cor só, azul)
const GEMA: Record<string, string> = {
  GRANADA: '#9B1C31', ESMERALDA: '#059669', DIAMANTE: '#38BDF8', JOALHERIA: '#F59E0B',
}
const BLUE = '#1B6CA8'

export function MetaWidget({ meta }: { meta: MetaInput }) {
  const faixas = [...meta.faixas].sort((a, b) => a.valor - b.valor)
  const topo = faixas[faixas.length - 1]?.valor ?? 0
  const fat = meta.faturamento
  // faixa atingida (maior cujo valor <= faturamento) e próxima
  const idxAtingida = faixas.reduce((acc, f, i) => (fat >= f.valor ? i : acc), -1)
  const atingida = idxAtingida >= 0 ? faixas[idxAtingida] : null
  const proxima = faixas[idxAtingida + 1] ?? null
  const alvoValor = proxima ? proxima.valor : topo
  const pctAlvo = alvoValor ? Math.min(100, (fat / alvoValor) * 100) : 0
  const faltam = Math.max(0, alvoValor - fat)
  const diasRestantes = Math.max(0, meta.diasUteis - meta.diasDecorridos)

  // ritmo do dia: quanto precisa por dia pra bater o alvo × o que fez hoje
  const metaDia = diasRestantes > 0 ? faltam / diasRestantes : 0
  const noRitmo = meta.faturamentoHoje >= metaDia
  const pctDia = metaDia > 0 ? Math.min(100, (meta.faturamentoHoje / metaDia) * 100) : 100

  // gauge (donut) — % até o alvo
  const R = 52, C = 2 * Math.PI * R
  const dash = (pctAlvo / 100) * C

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{meta.rotulo} <span className="font-normal text-gray-400">· {meta.loja}</span></h3>
        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">{meta.diasDecorridos}/{meta.diasUteis} dias</span>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
        {/* Gauge de progresso até a próxima faixa */}
        <div className="relative mx-auto h-[132px] w-[132px] shrink-0">
          <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
            <circle cx="66" cy="66" r={R} fill="none" stroke="#EEF2F6" strokeWidth="12" />
            <circle cx="66" cy="66" r={R} fill="none" stroke={BLUE} strokeWidth="12" strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold tabular-nums text-gray-900">{Math.round(pctAlvo)}%</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: proxima ? GEMA[proxima.nome] ?? BLUE : GEMA[topo ? faixas[faixas.length-1].nome : ''] ?? BLUE }}>
              {proxima ? `→ ${proxima.nome}` : '🏆 no topo'}
            </span>
          </div>
        </div>

        {/* QUANTO FALTA é o número-herói (o faturamento vem do histórico e é secundário) */}
        <div className="min-w-0">
          {proxima ? (
            <>
              <p className="text-xs font-medium text-gray-400">Faltam pra <span className="font-bold" style={{ color: GEMA[proxima.nome] ?? BLUE }}>{proxima.nome}</span></p>
              <p className="text-3xl font-extrabold tabular-nums text-gray-900">{formatBRL(faltam)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
                <span>Faturado <b className="tabular-nums text-gray-700">{formatBRL(fat)}</b></span>
                {atingida && (
                  <span className="inline-flex items-center gap-1 font-semibold" style={{ color: GEMA[atingida.nome] ?? BLUE }}>
                    · <span className="h-2 w-2 rounded-full" style={{ background: GEMA[atingida.nome] ?? BLUE }} /> {atingida.nome} batida
                  </span>
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                  🎁 Prêmio {proxima.nome}: {formatBRL(proxima.premio)}
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-gray-400">🏆 Todas as faixas batidas!</p>
              <p className="text-3xl font-extrabold tabular-nums text-gray-900">{formatBRL(fat)}</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: GEMA[faixas[faixas.length - 1]?.nome] ?? BLUE }}>{faixas[faixas.length - 1]?.nome} conquistada</p>
            </>
          )}
        </div>
      </div>

      {/* Barra geral com as faixas fincadas */}
      <div className="mt-5">
        <div className="relative h-3 rounded-full bg-gray-100">
          <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#1B6CA8] to-[#2a80b8]" style={{ width: `${topo ? Math.min(100, (fat / topo) * 100) : 0}%` }} />
          {faixas.map((f) => (
            <div key={f.nome} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${topo ? (f.valor / topo) * 100 : 0}%` }}>
              <div className={`h-4 w-0.5 ${fat >= f.valor ? 'bg-white' : 'bg-gray-300'}`} style={{ marginLeft: -1 }} />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide">
          {faixas.map((f) => (
            <span key={f.nome} className="flex items-center gap-1" style={{ color: fat >= f.valor ? GEMA[f.nome] ?? BLUE : '#9CA3AF' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: fat >= f.valor ? GEMA[f.nome] ?? BLUE : '#D1D5DB' }} />{f.nome}
            </span>
          ))}
        </div>
      </div>

      {/* Dia: valor de hoje × meta do dia */}
      <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/70 p-3.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-gray-500">Hoje</span>
          {diasRestantes > 0 ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${noRitmo ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {noRitmo ? '✅ no ritmo' : '⚠️ atrasado'}
            </span>
          ) : <span className="text-[11px] font-semibold text-gray-400">último dia</span>}
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Vendido hoje</p>
            <p className="text-xl font-bold tabular-nums text-gray-900">{formatBRL(meta.faturamentoHoje)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Meta do dia</p>
            <p className="text-xl font-bold tabular-nums text-gray-500">{formatBRL(metaDia)}</p>
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
          <div className={`h-full rounded-full ${noRitmo ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pctDia}%` }} />
        </div>
      </div>
    </div>
  )
}
