import Link from 'next/link'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { turnosDoDia, trabalhadoDoDia, horasPorPessoa, horasTexto, type Escala, type Excecao, type Ponto } from '@/lib/escala'
import { vinculoEncerrado } from '@/lib/vinculo'
import { Dica } from '@/components/Dica'

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const VINCULO_LABEL: Record<string, string> = {
  clt: 'CLT', mei: 'MEI', estagio: 'Estágio', autonomo: 'Autônomo',
  freelancer: 'Freelancer', treinamento: 'Treinamento',
}

// Todos os dias do mês, com o dia da semana (0=domingo, mesma convenção da escala).
function diasDoMes(mes: string): { data: string; diaSemana: number }[] {
  const [ano, m] = mes.split('-').map(Number)
  const ultimo = new Date(ano, m, 0).getDate()
  const out: { data: string; diaSemana: number }[] = []
  for (let d = 1; d <= ultimo; d++) {
    const data = `${mes}-${String(d).padStart(2, '0')}`
    out.push({ data, diaSemana: new Date(data + 'T12:00:00-03:00').getDay() })
  }
  return out
}

const mesAnterior = (mes: string) => {
  const [ano, m] = mes.split('-').map(Number)
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`
}
const mesSeguinte = (mes: string) => {
  const [ano, m] = mes.split('-').map(Number)
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, '0')}`
}

// CONFERÊNCIA DE HORAS — quanto a loja planejou e quanto cada pessoa dedicou.
//
// Uma linha por pessoa: previsto (escala) x trabalhado (ponto) x diferença, mais o
// saldo que o banco de horas fechou no mês. Não é folha de pagamento e não paga
// nada: é a conferência que o dono usa pra combinar o valor do serviço e a
// cobertura do mês seguinte.
export default async function ConferenciaHorasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const { mes: mesPedido } = await searchParams
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const mes = mesPedido && /^\d{4}-\d{2}$/.test(mesPedido) ? mesPedido : hoje.slice(0, 7)
  const dias = diasDoMes(mes)
  const inicio = dias[0].data
  const fim = dias[dias.length - 1].data

  const supabase = await createServiceClient()
  const [{ data: perfisRaw }, escalasRes, excecoesRes, pontosRes, banco] = await Promise.all([
    supabase.from('perfis').select('id, nome, vinculo, data_demissao').eq('ativo', true).order('nome'),
    supabase.from('escalas').select('*').eq('ativo', true),
    supabase.from('escala_excecoes').select('*').gte('data', inicio).lte('data', fim),
    supabase.from('pontos').select('usuario_id, tipo, criado_em')
      .gte('criado_em', `${inicio}T00:00:00-03:00`).lte('criado_em', `${fim}T23:59:59-03:00`).order('criado_em'),
    fetchAll<{ usuario_id: string; horas: number; motivo: string | null; confirmado: boolean | null }>(
      (from, to) => supabase.from('banco_horas').select('usuario_id, horas, motivo, confirmado').gte('data', inicio).lte('data', fim).range(from, to)),
  ])

  const perfis = ((perfisRaw ?? []) as { id: string; nome: string; vinculo: string | null; data_demissao: string | null }[])
    .filter((p) => p.vinculo !== 'treinamento' && !vinculoEncerrado(p.data_demissao, hoje))
  const nomes = Object.fromEntries(perfis.map((p) => [p.id, p.nome]))
  const escalas = (escalasRes.data ?? []) as Escala[]
  const excecoes = (excecoesRes.data ?? []) as Excecao[]
  const pontos = (pontosRes.data ?? []) as Ponto[]

  // previsto: o que a escala dos dias do mês soma (já sem folgas)
  const previsto = new Map(horasPorPessoa(dias, escalas, excecoes, nomes).map((h) => [h.perfilId, h.minutos]))
  const diasEscalados = new Map(horasPorPessoa(dias, escalas, excecoes, nomes).map((h) => [h.perfilId, h.dias]))

  // trabalhado: soma dos blocos fechados do ponto, dia a dia
  const trabalhado = new Map<string, number>()
  for (const d of dias) {
    for (const t of trabalhadoDoDia(pontos, d.data)) {
      trabalhado.set(t.perfilId, (trabalhado.get(t.perfilId) ?? 0) + t.minutos)
    }
  }

  // saldo do banco de horas no mês (só o confirmado/automático conta)
  const bancoMes = new Map<string, number>()
  for (const b of (banco ?? [])) {
    if (b.confirmado === false) continue
    bancoMes.set(b.usuario_id, (bancoMes.get(b.usuario_id) ?? 0) + Number(b.horas ?? 0))
  }

  const linhas = perfis.map((p) => {
    const prev = previsto.get(p.id) ?? 0
    const trab = trabalhado.get(p.id) ?? 0
    return {
      ...p,
      previsto: prev,
      trabalhado: trab,
      diasEscalados: diasEscalados.get(p.id) ?? 0,
      diferenca: trab - prev,
      saldoBanco: Math.round((bancoMes.get(p.id) ?? 0) * 60) / 60,
      temEscala: prev > 0,
    }
  })
  // quem tem escala primeiro; dentro disso, quem mais trabalhou
  linhas.sort((a, b) => Number(b.temEscala) - Number(a.temEscala) || b.trabalhado - a.trabalhado || a.nome.localeCompare(b.nome))

  const totalPrev = linhas.reduce((s, l) => s + l.previsto, 0)
  const totalTrab = linhas.reduce((s, l) => s + l.trabalhado, 0)
  const cor = (min: number) => (min > 0 ? 'text-emerald-700' : min < 0 ? 'text-rose-600' : 'text-gray-400')
  const nomeMes = `${NOMES_MES[Number(mes.split('-')[1]) - 1]}/${mes.split('-')[0]}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">⏱ Conferência de horas</h2>
        <Dica texto="Quanto a loja planejou (escala) e quanto cada pessoa dedicou de fato (ponto), no mês. Serve para combinar o valor do serviço e a cobertura do mês seguinte. Não paga nem desconta nada." />
        <Link href="/painel/rh" className="ml-auto rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">← RH / Equipe</Link>
      </div>

      <form action="/painel/rh/conferencia" className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <Link href={`/painel/rh/conferencia?mes=${mesAnterior(mes)}`} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">←</Link>
        <input type="month" name="mes" defaultValue={mes} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700" />
        <button type="submit" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Ver</button>
        <Link href={`/painel/rh/conferencia?mes=${mesSeguinte(mes)}`} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">→</Link>
        <span className="ml-auto text-sm font-semibold text-gray-500">{nomeMes}</span>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Previsto na escala</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{horasTexto(totalPrev)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Trabalhado no ponto</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{horasTexto(totalTrab)}</p>
        </div>
        <div className={`rounded-2xl border p-5 shadow-sm ${totalTrab - totalPrev >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className={`text-sm font-medium ${totalTrab - totalPrev >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>Diferença do mês</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${totalTrab - totalPrev >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{horasTexto(totalTrab - totalPrev)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Pessoa</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Vínculo</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Dias na escala</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Previsto</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Trabalhado</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Diferença</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo no banco</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map((l) => (
              <tr key={l.id} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{l.nome}</td>
                <td className="px-4 py-3 text-center">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{VINCULO_LABEL[l.vinculo ?? ''] ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-center text-sm tabular-nums text-gray-500">{l.temEscala ? l.diasEscalados : '—'}</td>
                <td className="px-4 py-3 text-center text-sm tabular-nums text-gray-700">{l.temEscala ? horasTexto(l.previsto) : '—'}</td>
                <td className="px-4 py-3 text-center text-sm tabular-nums font-semibold text-gray-800">{l.trabalhado ? horasTexto(l.trabalhado) : '—'}</td>
                <td className={`px-4 py-3 text-center text-sm tabular-nums font-semibold ${l.temEscala ? cor(l.diferenca) : 'text-gray-300'}`}>{l.temEscala ? horasTexto(l.diferenca) : '—'}</td>
                <td className={`px-4 py-3 text-center text-sm tabular-nums ${l.saldoBanco > 0 ? 'text-emerald-600' : l.saldoBanco < 0 ? 'text-rose-600' : 'text-gray-400'}`}>{l.saldoBanco === 0 ? '—' : horasTexto(l.saldoBanco * 60)}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma pessoa ativa neste mês.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 space-y-1">
        <p><b>Previsto</b> é a soma dos turnos da escala no mês; <b>trabalhado</b> é a soma dos blocos batidos no ponto. Num dia passado que ficou aberto (entrou e não saiu), a parte sem saída não conta; o dia de hoje conta até agora.</p>
        <p><b>Saldo no banco</b> é a soma do banco de horas do mês: positivo é hora a mais, negativo é hora a menos. É o número que você usa para combinar a cobertura do mês seguinte.</p>
        <p>Estagiário não acumula hora extra (Lei 11.788/2008): o que passar do combinado aparece na coluna de diferença, mas não vira saldo no banco.</p>
      </div>
    </div>
  )
}
