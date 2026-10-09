import { createServiceClient } from '@/lib/supabase/server'
import { turnosDoDia, type Escala, type Excecao } from '@/lib/escala'

const dataSP = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

// Detecta faltas: quem estava na escala e não bateu ponto nenhum num dia já encerrado.
// Cria lançamento 'falta' (horas negativas, confirmado=false) pro master abonar ou confirmar.
// Idempotente: não duplica pra mesma pessoa+data.
export async function detectarFaltas() {
  const s = await createServiceClient()
  const hoje = new Date()
  const datas: string[] = []
  for (let i = 1; i <= 7; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i)
    datas.push(d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
  }
  const primeiro = datas[datas.length - 1]
  const ultimo = datas[0]

  const [{ data: esc }, { data: exc }, { data: pts }, { data: perfis }, { data: jaFaltas }] = await Promise.all([
    s.from('escalas').select('*').eq('ativo', true),
    s.from('escala_excecoes').select('*').gte('data', primeiro).lte('data', ultimo),
    s.from('pontos').select('usuario_id, criado_em').gte('criado_em', primeiro + 'T00:00:00-03:00').lte('criado_em', ultimo + 'T23:59:59-03:00'),
    s.from('perfis').select('id, nome').eq('ativo', true),
    s.from('banco_horas').select('usuario_id, data').eq('motivo', 'falta').gte('data', primeiro).lte('data', ultimo),
  ])

  const nomes = Object.fromEntries((perfis ?? []).map((p) => [p.id, p.nome]))
  const ja = new Set((jaFaltas ?? []).map((f) => f.usuario_id + '|' + f.data))

  for (const data of datas) {
    const diaSemana = new Date(data + 'T12:00:00-03:00').getDay()
    const turnos = turnosDoDia(data, diaSemana, (esc ?? []) as Escala[], (exc ?? []) as Excecao[], nomes)
    const bateram = new Set((pts ?? []).filter((p) => dataSP(p.criado_em) === data).map((p) => p.usuario_id))
    for (const t of turnos) {
      if (t.folga) continue
      if (bateram.has(t.perfilId)) continue
      if (ja.has(t.perfilId + '|' + data)) continue
      const planejado = t.saida - t.entrada - (t.pausaIni !== null && t.pausaFim !== null ? Math.max(0, t.pausaFim - t.pausaIni) : 0)
      if (planejado <= 0) continue
      await s.from('banco_horas').insert({ usuario_id: t.perfilId, horas: -Math.round((planejado / 60) * 100) / 100, data, motivo: 'falta', obs: 'Falta (não bateu ponto)', confirmado: false })
    }
  }
}
