import { createServiceClient } from '@/lib/supabase/server'
import { EscalaClient } from './EscalaClient'
import { semanaDe, turnosDoDia, furosDoDia, horasPorPessoa, type Escala, type Excecao } from '@/lib/escala'

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

  const [perfisRes, escalasRes, excecoesRes, lojasRes] = await Promise.all([
    supabase.from('perfis').select('id, nome, cargo_id, cor_escala').eq('ativo', true).order('nome'),
    supabase.from('escalas').select('*').eq('ativo', true),
    supabase.from('escala_excecoes').select('*').gte('data', primeiro).lte('data', ultimo),
    supabase.from('lojas').select('id, nome').eq('ativa', true).order('nome'),
  ])

  const perfis = perfisRes.data ?? []
  const escalas = (escalasRes.data ?? []) as Escala[]
  const excecoes = (excecoesRes.data ?? []) as Excecao[]
  const nomes: Record<string, string> = Object.fromEntries(perfis.map((p) => [p.id, p.nome]))

  // pré-calcula, por dia: os turnos e os furos (a conta pesada fica no servidor)
  const grade = dias.map((d) => {
    const turnos = turnosDoDia(d.data, d.diaSemana, escalas, excecoes, nomes)
    return { ...d, turnos, furos: furosDoDia(turnos, d.diaSemana) }
  })

  const horas = horasPorPessoa(dias, escalas, excecoes, nomes)

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
      semanaAtual={primeiro}
    />
  )
}
