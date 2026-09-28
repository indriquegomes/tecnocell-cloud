import { createServiceClient, permissoesUsuarioAtual } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FreelancersClient } from './FreelancersClient'

// Horas trabalhadas (pontos não pagos): pares entrada/retorno -> pausa/saida.
function minutosTrabalhados(pontos: { tipo: string; criado_em: string }[]): number {
  let total = 0
  let inicio: number | null = null
  for (const p of pontos) {
    if (p.tipo === 'entrada' || p.tipo === 'retorno') inicio = new Date(p.criado_em).getTime()
    else if ((p.tipo === 'pausa' || p.tipo === 'saida') && inicio != null) {
      total += new Date(p.criado_em).getTime() - inicio
      inicio = null
    }
  }
  return Math.max(0, Math.round(total / 60000))
}

export default async function FreelancersPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const { isMaster, permissoes } = await permissoesUsuarioAtual()
  if (!isMaster && !permissoes.includes('rh') && !permissoes.includes('financeiro')) redirect('/painel')
  const supabase = await createServiceClient()

  const { data: freela } = await supabase.from('perfis').select('id, nome, freelancer_valor_hora').eq('freelancer', true).eq('ativo', true).order('nome')
  const freelancers = (freela ?? []) as { id: string; nome: string; freelancer_valor_hora: number | null }[]

  let pontos: { usuario_id: string; tipo: string; criado_em: string }[] = []
  const ids = freelancers.map((f) => f.id)
  if (ids.length) {
    const { data } = await supabase.from('pontos').select('usuario_id, tipo, criado_em').in('usuario_id', ids).is('pago_em', null).order('criado_em')
    pontos = (data ?? []) as { usuario_id: string; tipo: string; criado_em: string }[]
  }

  const resumo = freelancers.map((f) => {
    const ps = pontos.filter((p) => p.usuario_id === f.id)
    const minutos = minutosTrabalhados(ps)
    const horas = minutos / 60
    const valorHora = Number(f.freelancer_valor_hora) || 0
    return { id: f.id, nome: f.nome, horas, valorHora, total: horas * valorHora }
  })

  return <FreelancersClient resumo={resumo} erro={erro} />
}
