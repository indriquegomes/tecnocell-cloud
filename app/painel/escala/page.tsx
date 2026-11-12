import { createServiceClient } from '@/lib/supabase/server'
import { EscalaClient } from './EscalaClient'
import { semanaDe, turnosDoDia, furosDoDia, horasPorPessoa, trabalhadoDoDia, type Escala, type Excecao, type Ponto } from '@/lib/escala'
import { vinculoEncerrado } from '@/lib/vinculo'

export default async function EscalaPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; loja?: string }>
}) {
  const { semana, loja } = await searchParams
  const supabase = await createServiceClient()

  // segunda da semana pedida (ou a atual) — ?semana= inválido na URL (achado
  // testando erros) derrubava a tela com "Invalid time value"; cai pra hoje.
  const baseParseada = semana ? new Date(`${semana}T12:00:00-03:00`) : new Date()
  const base = Number.isNaN(baseParseada.getTime()) ? new Date() : baseParseada
  const dias = semanaDe(base)
  const primeiro = dias[0].data
  const ultimo = dias[dias.length - 1].data

  const [perfisRes, escalasRes, excecoesRes, lojasRes, pontosRes] = await Promise.all([
    supabase.from('perfis').select('id, nome, cargo_id, cor_escala, lojas_permitidas, data_demissao').eq('ativo', true).order('nome'),
    supabase.from('escalas').select('*').eq('ativo', true),
    supabase.from('escala_excecoes').select('*').gte('data', primeiro).lte('data', ultimo),
    supabase.from('lojas').select('id, nome').eq('ativa', true).order('nome'),
    // o PONTO — o que aconteceu de verdade (a Brunna Furtado Gonçalves apertando "pausa" pra lanchar)
    supabase.from('pontos').select('usuario_id, tipo, criado_em')
      .gte('criado_em', primeiro + 'T00:00:00-03:00')
      .lte('criado_em', ultimo + 'T23:59:59-03:00')
      .order('criado_em'),
  ])

  // Loja selecionada (a escala agora é POR LOJA — cada loja tem a sua equipe).
  const lojas = (lojasRes.data ?? []) as { id: string; nome: string }[]
  const lojaAtivaId = (loja && lojas.some((l) => l.id === loja) ? loja : lojas[0]?.id) ?? null

  // separa por loja: perfil pertence à loja (lojas_permitidas vazio = dono/master = vê todas)
  // data de demissão vencida = fora da escala, mesmo que ninguém tenha salvado o
  // perfil como inativo (o login já barra; a escala também precisa barrar).
  const hojeEscala = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const todosPerfis = ((perfisRes.data ?? []) as { id: string; nome: string; cargo_id: string | null; cor_escala: string | null; lojas_permitidas: string[] | null; data_demissao: string | null }[])
    .filter((p) => !vinculoEncerrado(p.data_demissao, hojeEscala))
  const perfis = lojaAtivaId ? todosPerfis.filter((p) => { const ls = p.lojas_permitidas ?? []; return ls.length === 0 || ls.includes(lojaAtivaId) }) : todosPerfis
  const todasEscalas = (escalasRes.data ?? []) as Escala[]
  const escalas = lojaAtivaId ? todasEscalas.filter((e) => e.loja_id === lojaAtivaId) : todasEscalas
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
      lojas={lojas}
      lojaAtivaId={lojaAtivaId}
      horas={horas}
      trabalhadoSemana={trabalhadoSemana}
      semanaAtual={primeiro}
    />
  )
}
