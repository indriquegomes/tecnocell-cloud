import { createServiceClient } from '@/lib/supabase/server'
import { Dica } from '@/components/Dica'

type Ponto = { usuario_id: string; tipo: string; criado_em: string }

function statusEHoras(pontos: Ponto[]) {
  const ultimo = pontos[pontos.length - 1]?.tipo ?? null
  const status = !ultimo ? 'fora' : ultimo === 'saida' ? 'encerrado' : ultimo === 'pausa' ? 'pausa' : 'trabalhando'
  let min = 0, aberto: number | null = null
  for (const p of pontos) {
    const t = new Date(p.criado_em).getTime()
    if (p.tipo === 'entrada' || p.tipo === 'retorno') aberto = t
    else if ((p.tipo === 'pausa' || p.tipo === 'saida') && aberto != null) { min += (t - aberto) / 60000; aberto = null }
  }
  if (aberto != null) min += (Date.now() - aberto) / 60000
  const entrada = pontos.find((p) => p.tipo === 'entrada')?.criado_em ?? null
  return { status, horas: `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`, entrada }
}

const fmtHora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—')

export default async function RhPage() {
  const supabase = await createServiceClient()
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const [{ data: perfis }, { data: pontos }] = await Promise.all([
    supabase.from('perfis').select('id, nome, cargo').eq('ativo', true).order('nome'),
    supabase.from('pontos').select('usuario_id, tipo, criado_em').gte('criado_em', `${hoje}T00:00:00-03:00`).order('criado_em'),
  ])
  const porUser: Record<string, Ponto[]> = {}
  for (const p of (pontos ?? []) as Ponto[]) (porUser[p.usuario_id] ??= []).push(p)

  const linhas = (perfis ?? []).map((u) => ({ ...u, ...statusEHoras(porUser[u.id] ?? []), batidas: porUser[u.id] ?? [] }))
  const trabalhando = linhas.filter((l) => l.status === 'trabalhando' || l.status === 'pausa').length

  const badge = (s: string) =>
    s === 'trabalhando' ? 'bg-emerald-50 text-emerald-700' : s === 'pausa' ? 'bg-amber-50 text-amber-700' : s === 'encerrado' ? 'bg-gray-100 text-gray-500' : 'bg-gray-50 text-gray-400'
  const label = (s: string) => (s === 'trabalhando' ? '🟢 Trabalhando' : s === 'pausa' ? '⏸ Pausa' : s === 'encerrado' ? '✓ Encerrado' : 'Fora')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">RH / Equipe</h2>
        <Dica texto="Espelho de ponto do dia: quem está trabalhando, horas e batidas. As pessoas batem o ponto no Meu Perfil." />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-emerald-700">Trabalhando agora</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">{trabalhando}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Equipe ativa</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{linhas.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Bateram ponto hoje</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{linhas.filter((l) => l.batidas.length > 0).length}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Pessoa</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Entrada</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Trabalhado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Batidas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-800">{l.nome}</p>
                  {l.cargo && <p className="text-xs text-gray-400">{l.cargo}</p>}
                </td>
                <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge(l.status)}`}>{label(l.status)}</span></td>
                <td className="px-4 py-3 text-center text-sm tabular-nums text-gray-600">{fmtHora(l.entrada)}</td>
                <td className="px-4 py-3 text-center text-sm font-semibold tabular-nums text-gray-800">{l.batidas.length ? l.horas : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {l.batidas.length === 0 ? <span className="text-xs text-gray-300">sem batidas</span> : l.batidas.map((p, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500">
                        {p.tipo === 'pausa' ? '⏸' : p.tipo === 'saida' ? '⏹' : '▶'}{fmtHora(p.criado_em)}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
