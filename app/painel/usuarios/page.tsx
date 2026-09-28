import { createServiceClient, permissoesUsuarioAtual } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { redirect } from 'next/navigation'
import { UsuariosClient } from './UsuariosClient'

// Lê a config de PDV do perfil de forma tolerante — se a migration
// (colunas lojas_permitidas/pdv_*) ainda não rodou, não quebra a página.
type CfgPerfil = {
  lojasPermitidas: string[]; tabelasPermitidas: string[]; pdvLojaId: string | null; pdvDepositoId: string | null
  acessoHoraInicio: string | null; acessoHoraFim: string | null
  acessoBloqSabado: boolean; acessoBloqDomingo: boolean; acessoBloqFeriado: boolean
  metaVendaMensal: number
  salario: number
  chavePix: string | null
  motoboyValorFixo: number; motoboyAdicionalLoja: number; motoboyAdicionalExtra: number; motoboyTipo: string | null
  vinculo: string | null; meiValorServico: number; meiDiaPagamento: string | null; meiFuncoes: string | null; cltValeTransporte: number
  freelancer: boolean; freelancerValorHora: number
}
async function configPdvPorPerfil(
  supabase: Awaited<ReturnType<typeof createServiceClient>>
): Promise<Record<string, CfgPerfil>> {
  try {
    const { data } = await supabase.from('perfis').select('id, lojas_permitidas, tabelas_permitidas, pdv_loja_id, pdv_deposito_id, acesso_hora_inicio, acesso_hora_fim, acesso_bloqueia_sabado, acesso_bloqueia_domingo, acesso_bloqueia_feriado, meta_venda_mensal, salario, chave_pix, motoboy_valor_fixo, motoboy_adicional_loja, motoboy_adicional_extra, motoboy_tipo, vinculo, mei_valor_servico, mei_dia_pagamento, mei_funcoes, clt_vale_transporte, freelancer, freelancer_valor_hora')
    return Object.fromEntries(
      (data ?? []).map((p) => [p.id, {
        lojasPermitidas: (p.lojas_permitidas ?? []) as string[],
        tabelasPermitidas: ((p as { tabelas_permitidas?: string[] | null }).tabelas_permitidas ?? []) as string[],
        pdvLojaId: p.pdv_loja_id ?? null,
        pdvDepositoId: p.pdv_deposito_id ?? null,
        acessoHoraInicio: p.acesso_hora_inicio ?? null,
        acessoHoraFim: p.acesso_hora_fim ?? null,
        acessoBloqSabado: p.acesso_bloqueia_sabado ?? false,
        acessoBloqDomingo: p.acesso_bloqueia_domingo ?? false,
        acessoBloqFeriado: p.acesso_bloqueia_feriado ?? false,
        metaVendaMensal: Number(p.meta_venda_mensal ?? 0),
        salario: Number(p.salario ?? 0),
        chavePix: p.chave_pix ?? null,
        motoboyValorFixo: Number(p.motoboy_valor_fixo ?? 0),
        motoboyAdicionalLoja: Number(p.motoboy_adicional_loja ?? 0),
        motoboyAdicionalExtra: Number(p.motoboy_adicional_extra ?? 0),
        motoboyTipo: p.motoboy_tipo ?? null,
        vinculo: p.vinculo ?? null,
        meiValorServico: Number(p.mei_valor_servico ?? 0),
        meiDiaPagamento: p.mei_dia_pagamento ?? null,
        meiFuncoes: p.mei_funcoes ?? null,
        cltValeTransporte: Number(p.clt_vale_transporte ?? 0),
        freelancer: p.freelancer === true,
        freelancerValorHora: Number(p.freelancer_valor_hora ?? 0),
      }])
    )
  } catch { return {} }
}

export default async function UsuariosPage() {
  // Gerenciar contas/permissões é informação delicada de TODOS os usuários — só
  // master tem acesso total. Os demais veem só o próprio perfil (meu-perfil).
  const { isMaster } = await permissoesUsuarioAtual()
  if (!isMaster) redirect('/painel/meu-perfil')

  const supabase = await createServiceClient()
  // Separa a lista por loja ativa (mesma regra do RH). Master vê tudo.
  const { ativa, todas } = await lojasDoUsuario().catch(() => ({ ativa: null, todas: true }))

  // Lista usuários do Auth + perfis
  const [authResult, perfisResult, cargosResult, lojasResult, depositosResult, cfgPdv, tabelasResult] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from('perfis').select('id, nome, username, permissoes, is_master, ativo, created_at, cargo_id'),
    supabase.from('cargos').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('lojas').select('id, nome').eq('ativa', true).order('nome'),
    supabase.from('depositos').select('id, nome, loja_id').order('nome'),
    configPdvPorPerfil(supabase),
    supabase.from('tabelas_preco').select('id, nome').eq('ativa', true).eq('usa_preco_custo', false).order('nome'),
  ])

  const authUsers = authResult.data?.users ?? []
  const perfisMap = Object.fromEntries(
    (perfisResult.data ?? []).map((p) => [p.id, p])
  )
  const cargos = (cargosResult.data ?? []) as { id: string; nome: string }[]
  const lojas = (lojasResult.data ?? []) as { id: string; nome: string }[]
  const depositos = (depositosResult.data ?? []) as { id: string; nome: string; loja_id: string | null }[]
  const tabelas = (tabelasResult.data ?? []) as { id: string; nome: string }[]

  // Horários (escala semanal) de cada usuário — pra preencher o editor nos Usuários.
  const { data: escalasRaw } = await supabase.from('escalas').select('perfil_id, dia, entrada, saida').eq('ativo', true)
  const horariosPorPerfil: Record<string, Record<number, { entrada: string; saida: string }>> = {}
  for (const e of (escalasRaw ?? []) as { perfil_id: string; dia: number; entrada: string; saida: string }[]) {
    ;(horariosPorPerfil[e.perfil_id] = horariosPorPerfil[e.perfil_id] || {})[e.dia] = { entrada: e.entrada, saida: e.saida }
  }

  const usuarios = authUsers
    .filter((u) => perfisMap[u.id])
    .map((u) => ({
      id: u.id,
      email: u.email ?? '',
      username: (perfisMap[u.id] as { username?: string | null })?.username ?? '',
      nome: perfisMap[u.id]?.nome ?? u.email ?? '',
      permissoes: (perfisMap[u.id]?.permissoes ?? []) as string[],
      isMaster: perfisMap[u.id]?.is_master ?? false,
      ativo: perfisMap[u.id]?.ativo ?? true,
      cargoId: (perfisMap[u.id] as { cargo_id?: string | null })?.cargo_id ?? null,
      lojasPermitidas: cfgPdv[u.id]?.lojasPermitidas ?? [],
      tabelasPermitidas: cfgPdv[u.id]?.tabelasPermitidas ?? [],
      pdvLojaId: cfgPdv[u.id]?.pdvLojaId ?? null,
      pdvDepositoId: cfgPdv[u.id]?.pdvDepositoId ?? null,
      acessoHoraInicio: cfgPdv[u.id]?.acessoHoraInicio ?? null,
      acessoHoraFim: cfgPdv[u.id]?.acessoHoraFim ?? null,
      acessoBloqSabado: cfgPdv[u.id]?.acessoBloqSabado ?? false,
      acessoBloqDomingo: cfgPdv[u.id]?.acessoBloqDomingo ?? false,
      acessoBloqFeriado: cfgPdv[u.id]?.acessoBloqFeriado ?? false,
      metaVendaMensal: cfgPdv[u.id]?.metaVendaMensal ?? 0,
      salario: cfgPdv[u.id]?.salario ?? 0,
      chavePix: cfgPdv[u.id]?.chavePix ?? null,
      motoboyValorFixo: cfgPdv[u.id]?.motoboyValorFixo ?? 0,
      motoboyAdicionalLoja: cfgPdv[u.id]?.motoboyAdicionalLoja ?? 0,
      motoboyAdicionalExtra: cfgPdv[u.id]?.motoboyAdicionalExtra ?? 0,
      motoboyTipo: cfgPdv[u.id]?.motoboyTipo ?? null,
      vinculo: cfgPdv[u.id]?.vinculo ?? null,
      meiValorServico: cfgPdv[u.id]?.meiValorServico ?? 0,
      meiDiaPagamento: cfgPdv[u.id]?.meiDiaPagamento ?? null,
      meiFuncoes: cfgPdv[u.id]?.meiFuncoes ?? null,
      cltValeTransporte: cfgPdv[u.id]?.cltValeTransporte ?? 0,
      freelancer: cfgPdv[u.id]?.freelancer ?? false,
      freelancerValorHora: cfgPdv[u.id]?.freelancerValorHora ?? 0,
      horarios: horariosPorPerfil[u.id] ?? {},
      created_at: u.created_at,
    }))

  // Funcionário pertence às lojas em lojas_permitidas (vazio = master/dono).
  // Quem tem as DUAS (gerente geral) aparece nas duas — pdv_loja_id é só o padrão.
  const lojasDe = (u: (typeof usuarios)[number]) => u.lojasPermitidas
  const usuariosFiltrados = (todas || !ativa?.id)
    ? usuarios
    : usuarios.filter((u) => u.isMaster || lojasDe(u).length === 0 || lojasDe(u).includes(ativa.id))

  return <UsuariosClient usuarios={usuariosFiltrados} cargos={cargos} lojas={lojas} depositos={depositos} tabelas={tabelas} />
}
