import Link from 'next/link'
import { IconUsers } from '@/components/icons'
import { createServiceClient, fetchAll, permissoesUsuarioAtual } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { Dica } from '@/components/Dica'
import { formatDate } from '@/lib/utils'
import { LancarHoraForm } from './LancarHoraForm'
import { BatidasPonto } from './BatidasPonto'
import { confirmarDobra, abonarFalta, confirmarFalta } from './actions'
import { ExtratoBancoHoras } from './ExtratoBancoHoras'
import { detectarFaltas } from '@/lib/faltas'
import { vinculoEncerrado } from '@/lib/vinculo'

const LIMITE_EXTRA = 8
const fmtH = (h: number) => {
  const m = Math.round(Math.abs(h) * 60)
  // m===0 → sem sinal: h minúsculo negativo (ex -0.0001) não pode virar "-0h00m"
  const sinal = m === 0 ? '' : h > 0 ? '+' : '−'
  return `${sinal}${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

type Ponto = { id: string; usuario_id: string; tipo: string; criado_em: string }

function statusEHoras(pontos: Ponto[], agoraMs: number | null) {
  const ultimo = pontos[pontos.length - 1]?.tipo ?? null
  const status = !ultimo ? 'fora' : ultimo === 'saida' ? 'encerrado' : ultimo === 'pausa' ? 'pausa' : 'trabalhando'
  let min = 0, aberto: number | null = null
  for (const p of pontos) {
    const t = new Date(p.criado_em).getTime()
    if (p.tipo === 'entrada' || p.tipo === 'retorno') aberto = t
    else if ((p.tipo === 'pausa' || p.tipo === 'saida') && aberto != null) { min += (t - aberto) / 60000; aberto = null }
  }
  // dia passado não soma "até agora": o turno que ficou aberto é dado a revisar,
  // não hora trabalhada (senão a terça sem saída vira 40h de trabalho).
  if (aberto != null && agoraMs != null) min += (agoraMs - aberto) / 60000
  const entrada = pontos.find((p) => p.tipo === 'entrada')?.criado_em ?? null
  return { status, horas: `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`, entrada }
}

const fmtHora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—')

// 'YYYY-MM-DD' ± n dias, resolvido ao meio-dia de São Paulo (nunca toISOString:
// depois das 21h o UTC vira o dia seguinte e a setinha pula dois dias).
const mudarDia = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00-03:00')
  x.setDate(x.getDate() + n)
  return x.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export default async function RhPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>
}) {
  const { dia } = await searchParams
  const supabase = await createServiceClient()
  await detectarFaltas()
  const { isMaster } = await permissoesUsuarioAtual()
  const { todasLojas, operaveis } = await lojasDoUsuario().catch(() => ({ todasLojas: [] as { id: string; nome: string }[], operaveis: [] as { id: string; nome: string }[] }))
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  // A espelho mostra UM dia — o escolhido na setinha do topo, hoje por padrão.
  // Mostrar só hoje fazia a tela parecer vazia ("ninguém bate ponto") quando o
  // dono olhava de madrugada ou antes das 8h, com o dia ainda sem batida.
  const diaSel = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : hoje
  const ehHoje = diaSel === hoje
  const [{ data: perfisRaw }, { data: pontos }, banco] = await Promise.all([
    supabase.from('perfis').select('id, nome, cargo, pdv_loja_id, lojas_permitidas, data_demissao').eq('ativo', true).order('nome'),
    supabase.from('pontos').select('id, usuario_id, tipo, criado_em').gte('criado_em', `${diaSel}T00:00:00-03:00`).lte('criado_em', `${diaSel}T23:59:59-03:00`).order('criado_em'),
    fetchAll<{ id: string; usuario_id: string; horas: number; data: string; motivo: string | null; obs: string | null; confirmado: boolean | null }>(
      (from, to) => supabase.from('banco_horas').select('id, usuario_id, horas, data, motivo, obs, confirmado').order('data', { ascending: false }).range(from, to)),
  ])
  // Equipe separada por loja. Funcionário pertence às lojas em lojas_permitidas
  // (vazio = sem loja definida). pdv_loja_id é só o padrão do PDV, não define a lista.
  const lojasDe = (p: { lojas_permitidas?: string[] | null } | null) => ((p?.lojas_permitidas) ?? []).filter(Boolean) as string[]
  // Desligado não é equipe: data de demissão vencida tira da lista mesmo que o
  // perfil ainda esteja marcado ativo (demissão com data futura que venceu).
  type PerfilRH = { id: string; nome: string; cargo: string | null; pdv_loja_id: string | null; lojas_permitidas: string[] | null; data_demissao: string | null }
  const perfis = ((perfisRaw ?? []) as PerfilRH[]).filter((p) => !vinculoEncerrado(p.data_demissao, hoje))
  const porUser: Record<string, Ponto[]> = {}
  for (const p of (pontos ?? []) as Ponto[]) (porUser[p.usuario_id] ??= []).push(p)

  const linhas = (perfis ?? []).map((u) => ({ ...u, ...statusEHoras(porUser[u.id] ?? [], ehHoje ? Date.now() : null), batidas: porUser[u.id] ?? [] }))
  const lojasSecao = operaveis.length > 0 ? operaveis : todasLojas
  // Seções: uma por loja + "Ambas as lojas" + "Sem loja definida". Cada pessoa aparece UMA vez.
  const secoes = [
    ...lojasSecao.map((l) => ({ titulo: l.nome, linhas: linhas.filter((x) => lojasDe(x as { lojas_permitidas?: string[] | null }).length === 1 && lojasDe(x as { lojas_permitidas?: string[] | null })[0] === l.id) })),
    { titulo: 'Ambas as lojas', linhas: linhas.filter((x) => lojasDe(x as { lojas_permitidas?: string[] | null }).length > 1) },
    { titulo: 'Sem loja definida', linhas: linhas.filter((x) => lojasDe(x as { lojas_permitidas?: string[] | null }).length === 0) },
  ].filter((s) => s.linhas.length > 0)
  const trabalhando = linhas.filter((l) => l.status === 'trabalhando' || l.status === 'pausa').length

  // Num dia que já passou ninguém está "trabalhando agora": quem ficou sem saída
  // ou sem retorno é ponto pra revisar (e é o que o master conserta na batida).
  const statusVisto = (s: string) => (!ehHoje && s === 'trabalhando' ? 'sem-saida' : !ehHoje && s === 'pausa' ? 'sem-retorno' : s)
  const badge = (s: string) =>
    s === 'trabalhando' ? 'bg-emerald-50 text-emerald-700' : s === 'pausa' ? 'bg-amber-50 text-amber-700' : s === 'encerrado' ? 'bg-gray-100 text-gray-500' : s === 'sem-saida' || s === 'sem-retorno' ? 'bg-rose-50 text-rose-600' : 'bg-gray-50 text-gray-400'
  const label = (s: string) => (s === 'trabalhando' ? '🟢 Trabalhando' : s === 'pausa' ? '⏸ Pausa' : s === 'encerrado' ? '✓ Encerrado' : s === 'sem-saida' ? '⚠ Sem saída' : s === 'sem-retorno' ? '⚠ Sem retorno' : 'Fora')

  // ---- Banco de horas ----
  const bancoItens = (banco ?? []) as { id: string; usuario_id: string; horas: number; data: string; motivo: string | null; obs: string | null; confirmado: boolean | null }[]
  const dobrasPendentes = bancoItens.filter((b) => b.motivo === 'dobra' && b.confirmado === false)
  const faltasPendentes = bancoItens.filter((b) => b.motivo === 'falta' && b.confirmado === false)
  const saldoPorUser: Record<string, number> = {}
  for (const b of bancoItens) if (b.confirmado !== false) saldoPorUser[b.usuario_id] = (saldoPorUser[b.usuario_id] ?? 0) + Number(b.horas)
  // Nomes do extrato saem de TODOS os perfis, não só da equipe do dia: linha de
  // banco de horas de quem foi desligado continua com nome, nunca "—".
  const nomePorUser: Record<string, string> = Object.fromEntries(((perfisRaw ?? []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]))
  // arredonda pro minuto: soma de decimais pode dar -0.003h (fração de segundo) e virar vermelho
const saldos = (perfis ?? []).map((u) => ({ id: u.id, nome: u.nome, saldo: Math.round((saldoPorUser[u.id] ?? 0) * 60) / 60 })).sort((a, b) => b.saldo - a.saldo)
  const corSaldo = (h: number) => (h < 0 ? 'text-rose-600' : h >= LIMITE_EXTRA ? 'text-amber-600' : 'text-emerald-600')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <IconUsers className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">RH / Equipe</h2>
        <Dica texto="Espelho de ponto do dia escolhido: quem trabalhou, quanto tempo e cada batida. As pessoas batem o ponto no Meu Perfil — a lista da direita já mostra o que aconteceu de verdade no dia." />
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/painel/rh?dia=${mudarDia(diaSel, -1)}`} title="Dia anterior" className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">←</Link>
          <form action="/painel/rh" className="flex items-center gap-1">
            <input type="date" name="dia" defaultValue={diaSel} max={hoje} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700" />
            <button type="submit" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Ver</button>
          </form>
          {diaSel < hoje && <Link href={`/painel/rh?dia=${mudarDia(diaSel, 1)}`} title="Dia seguinte" className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">→</Link>}
          {!ehHoje && <Link href="/painel/rh" className="rounded-lg bg-[#1B6CA8] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#155a8c] transition">Voltar pra hoje</Link>}
          <Link href="/painel/rh/feriados" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">🗓 Feriados</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className={`rounded-2xl border p-5 shadow-sm ${ehHoje ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
          <p className={`text-sm font-medium ${ehHoje ? 'text-emerald-700' : 'text-gray-600'}`}>{ehHoje ? 'Trabalhando agora' : 'Fecharam o ponto no dia'}</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${ehHoje ? 'text-emerald-700' : 'text-gray-900'}`}>{ehHoje ? trabalhando : linhas.filter((l) => l.status === 'encerrado').length}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Equipe ativa</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{linhas.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Bateram ponto {ehHoje ? 'hoje' : 'no dia'}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{linhas.filter((l) => l.batidas.length > 0).length}</p>
        </div>
      </div>

      <p className="text-sm font-medium text-gray-500">{ehHoje ? 'Hoje' : formatDate(diaSel)} <span className="text-gray-400">· {linhas.reduce((s, l) => s + l.batidas.length, 0)} batida(s) registrada(s) {ehHoje ? 'até agora' : 'no dia'}</span></p>

      {secoes.map((s) => (
        <div key={s.titulo} className="space-y-2">
          <h3 className="pt-2 text-sm font-bold text-gray-700">{s.titulo} <span className="font-normal text-gray-400">({s.linhas.length})</span></h3>
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
                {s.linhas.map((l) => (
                  <tr key={l.id} className="hover:bg-blue-50/60 transition">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">{l.nome}</p>
                      {l.cargo && <p className="text-xs text-gray-400">{l.cargo}</p>}
                    </td>
                    <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge(statusVisto(l.status))}`}>{label(statusVisto(l.status))}</span></td>
                    <td className="px-4 py-3 text-center text-sm tabular-nums text-gray-600">{fmtHora(l.entrada)}</td>
                    <td className="px-4 py-3 text-center text-sm font-semibold tabular-nums text-gray-800">{l.batidas.length ? l.horas : '—'}</td>
                    <td className="px-4 py-3">
                      <BatidasPonto batidas={l.batidas} usuarioId={l.id} isMaster={isMaster} dia={diaSel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* ---- BANCO DE HORAS ---- */}
      <div className="flex items-center gap-2 pt-2">
        <h3 className="text-lg font-bold text-gray-900">Banco de Horas</h3>
        <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600">Limite {LIMITE_EXTRA}h extra</span>
        <Dica texto="Adicione/retire horas com motivo. Positivo = hora extra; negativo = atraso, pagamento ou folga. Pago ou vira folga até o fim do mês." />
      </div>

      <LancarHoraForm pessoas={(perfis ?? []).map((u) => ({ id: u.id, nome: u.nome }))} />

      {/* Dobras aguardando confirmação do master */}
      {dobrasPendentes.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">⏳ Dobras aguardando confirmação</p>
          <div className="mt-2 space-y-2">
            {dobrasPendentes.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-gray-700">{nomePorUser[b.usuario_id] ?? '—'} <span className="text-gray-400">· {formatDate(b.data)} ·</span> <b className="text-emerald-600">{fmtH(Number(b.horas))}</b></span>
                <form action={confirmarDobra.bind(null, b.id)}>
                  <button type="submit" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition">Confirmar dobra</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Faltas pra revisar (abonar ou confirmar) */}
      {faltasPendentes.length > 0 && (
        <div id="faltas" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-800">⚠️ Faltas pra revisar — abone a justificada ou confirme o desconto</p>
          <div className="mt-2 space-y-2">
            {faltasPendentes.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-gray-700">{nomePorUser[b.usuario_id] ?? '—'} <span className="text-gray-400">· {formatDate(b.data)} ·</span> <b className="text-rose-600">{fmtH(Number(b.horas))}</b></span>
                <div className="flex gap-2">
                  <form action={abonarFalta.bind(null, b.id)}>
                    <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition">Abonar (justificar)</button>
                  </form>
                  <form action={confirmarFalta.bind(null, b.id)}>
                    <button type="submit" className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition">Confirmar desconto</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saldos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {saldos.map((u) => (
          <div key={u.id} className={`flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm ${u.saldo >= LIMITE_EXTRA ? 'border-amber-200' : u.saldo < 0 ? 'border-rose-200' : 'border-gray-200'}`}>
            <span className="truncate pr-2 text-sm font-medium text-gray-700">{u.nome}</span>
            <span className={`shrink-0 text-lg font-bold tabular-nums ${corSaldo(u.saldo)}`}>{fmtH(u.saldo)}</span>
          </div>
        ))}
      </div>

      {/* Últimos lançamentos (extrato, escondido por padrão) */}
      <ExtratoBancoHoras itens={bancoItens} nomes={nomePorUser} />
    </div>
  )
}
