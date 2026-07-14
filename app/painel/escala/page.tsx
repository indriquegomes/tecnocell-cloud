import { createServiceClient } from '@/lib/supabase/server'
import { EscalaClient } from './EscalaClient'
import { semanaDe, turnosDoDia, furosDoDia, horasPorPessoa, trabalhadoDoDia, type Escala, type Excecao, type Ponto } from '@/lib/escala'

export default async function EscalaPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>
}) {
  const { semana } = await searchParams
  const supabase = await createServiceClient()

  // segunda da semana pedida (ou a atual)
  const base = semana ? new Date(`${semana}T12:00:00-03:00`) : new Date()
  const dias = semanaDe(base)
  const primeiro = dias[0].data
  const ultimo = dias[dias.length - 1].data

  const [perfisRes, escalasRes, excecoesRes, lojasRes, pontosRes] = await Promise.all([
    supabase.from('perfis').select('id, nome, cargo_id, cor_escala').eq('ativo', true).order('nome'),
    supabase.from('escalas').select('*').eq('ativo', true),
    supabase.from('escala_excecoes').select('*').gte('data', primeiro).lte('data', ultimo),
    supabase.from('lojas').select('id, nome').eq('ativa', true).order('nome'),
    // o PONTO — o que aconteceu de verdade (a Bruna apertando "pausa" pra lanchar)
    supabase.from('pontos').select('usuario_id, tipo, criado_em')
      .gte('criado_em', primeiro + 'T00:00:00-03:00')
      .lte('criado_em', ultimo + 'T23:59:59-03:00')
      .order('criado_em'),
  ])

  const perfis = perfisRes.data ?? []
  const escalas = (escalasRes.data ?? []) as Escala[]
  const excecoes = (excecoesRes.data ?? []) as Excecao[]
  const nomes: Record<string, string> = Object.fromEntries(perfis.map((p) => [p.id, p.nome]))

  const pontos = (pontosRes.data ?? []) as Ponto[]

  // pré-calcula, por dia: o PLANO (turnos/furos) e o REAL (o que bateram no ponto)
  const grade = dias.map((d) => {
    const turnos = turnosDoDia(d.data, d.diaSemana, escalas, excecoes, nomes)
    return {
      ...d,
      turnos,
      furos: furosDoDia(turnos, d.diaSemana),
      trabalhado: trabalhadoDoDia(pontos, d.data),
    }
  })

  const horas = horasPorPessoa(dias, escalas, excecoes, nomes)

  // tempo REALMENTE trabalhado na semana, por pessoa. Só isso — sem julgar.
  const trabalhadoSemana: Record<string, number> = {}
  for (const d of grade) {
    for (const t of d.trabalhado) trabalhadoSemana[t.perfilId] = (trabalhadoSemana[t.perfilId] ?? 0) + t.minutos
  }

  const cores: Record<string, string | null> = Object.fromEntries(
    perfis.map((p) => [p.id, (p as { cor_escala?: string | null }).cor_escala ?? null]),
  )

  return (
    <EscalaClient
      dias={grade}
      perfis={perfis}
      cores={cores}
      escalas={escalas}
      excecoes={excecoes}
      lojas={lojasRes.data ?? []}
      horas={horas}
      trabalhadoSemana={trabalhadoSemana}
      semanaAtual={primeiro}
    />
  )
}
