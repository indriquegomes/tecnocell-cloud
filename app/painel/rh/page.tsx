import { IconUsers } from '@/components/icons'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { Dica } from '@/components/Dica'
import { formatDate } from '@/lib/utils'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { LancarHoraForm } from './LancarHoraForm'
import { excluirHora } from './actions'

const LIMITE_EXTRA = 8
const MOTIVO_LABEL: Record<string, string> = {
  solicitacao_loja: 'Solicitação da loja', cobrir_colega: 'Cobrir colega',
  atraso: 'Atraso', pagamento: 'Pagamento', folga: 'Folga', outro: 'Outro',
}
const fmtH = (h: number) => `${h > 0 ? '+' : ''}${h.toFixed(2).replace('.', ',')}h`

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
  const [{ data: perfis }, { data: pontos }, banco] = await Promise.all([
    supabase.from('perfis').select('id, nome, cargo').eq('ativo', true).order('nome'),
    supabase.from('pontos').select('usuario_id, tipo, criado_em').gte('criado_em', `${hoje}T00:00:00-03:00`).order('criado_em'),
    fetchAll<{ id: string; usuario_id: string; horas: number; data: string; motivo: string | null; obs: string | null }>(
      (from, to) => supabase.from('banco_horas').select('id, usuario_id, horas, data, motivo, obs').order('data', { ascending: false }).range(from, to)),
  ])
  const porUser: Record<string, Ponto[]> = {}
  for (const p of (pontos ?? []) as Ponto[]) (porUser[p.usuario_id] ??= []).push(p)

  const linhas = (perfis ?? []).map((u) => ({ ...u, ...statusEHoras(porUser[u.id] ?? []), batidas: porUser[u.id] ?? [] }))
  const trabalhando = linhas.filter((l) => l.status === 'trabalhando' || l.status === 'pausa').length

  const badge = (s: string) =>
    s === 'trabalhando' ? 'bg-emerald-50 text-emerald-700' : s === 'pausa' ? 'bg-amber-50 text-amber-700' : s === 'encerrado' ? 'bg-gray-100 text-gray-500' : 'bg-gray-50 text-gray-400'
  const label = (s: string) => (s === 'trabalhando' ? '🟢 Trabalhando' : s === 'pausa' ? '⏸ Pausa' : s === 'encerrado' ? '✓ Encerrado' : 'Fora')

  // ---- Banco de horas ----
  const bancoItens = (banco ?? []) as { id: string; usuario_id: string; horas: number; data: string; motivo: string | null; obs: string | null }[]
  const saldoPorUser: Record<string, number> = {}
  for (const b of bancoItens) saldoPorUser[b.usuario_id] = (saldoPorUser[b.usuario_id] ?? 0) + Number(b.horas)
  const nomePorUser: Record<string, string> = Object.fromEntries((perfis ?? []).map((u) => [u.id, u.nome]))
  const saldos = (perfis ?? []).map((u) => ({ id: u.id, nome: u.nome, saldo: saldoPorUser[u.id] ?? 0 })).sort((a, b) => b.saldo - a.saldo)
  const corSaldo = (h: number) => (h < 0 ? 'text-rose-600' : h >= LIMITE_EXTRA ? 'text-amber-600' : 'text-emerald-600')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconUsers className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
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

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
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
              <tr key={l.id} className="hover:bg-blue-50/60 transition">
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

      {/* ---- BANCO DE HORAS ---- */}
      <div className="flex items-center gap-2 pt-2">
        <h3 className="text-lg font-bold text-gray-900">Banco de Horas</h3>
        <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600">Limite {LIMITE_EXTRA}h extra</span>
        <Dica texto="Adicione/retire horas com motivo. Positivo = hora extra; negativo = atraso, pagamento ou folga. Pago ou vira folga até o fim do mês." />
      </div>

      <LancarHoraForm pessoas={(perfis ?? []).map((u) => ({ id: u.id, nome: u.nome }))} />

      {/* Saldos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {saldos.map((u) => (
          <div key={u.id} className={`flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm ${u.saldo >= LIMITE_EXTRA ? 'border-amber-200' : u.saldo < 0 ? 'border-rose-200' : 'border-gray-200'}`}>
            <span className="truncate pr-2 text-sm font-medium text-gray-700">{u.nome}</span>
            <span className={`shrink-0 text-lg font-bold tabular-nums ${corSaldo(u.saldo)}`}>{fmtH(u.saldo)}</span>
          </div>
        ))}
      </div>

      {/* Últimos lançamentos */}
      {bancoItens.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3.5"><h4 className="text-sm font-semibold text-gray-800">Últimos lançamentos</h4></div>
          <div className="divide-y divide-gray-50">
            {bancoItens.slice(0, 20).map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-800">{nomePorUser[b.usuario_id] ?? '—'} <span className="text-gray-400">· {MOTIVO_LABEL[b.motivo ?? ''] ?? b.motivo ?? '—'}</span></p>
                  <p className="text-xs text-gray-400">{formatDate(b.data)}{b.obs ? ` · ${b.obs}` : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-sm font-bold tabular-nums ${Number(b.horas) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtH(Number(b.horas))}</span>
                  <BotaoExcluir action={excluirHora.bind(null, b.id)} mensagem="Excluir este lançamento de hora?" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
