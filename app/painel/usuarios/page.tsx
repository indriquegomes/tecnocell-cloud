import { createServiceClient } from '@/lib/supabase/server'
import { UsuariosClient } from './UsuariosClient'

// Lê a config de PDV do perfil de forma tolerante — se a migration
// (colunas lojas_permitidas/pdv_*) ainda não rodou, não quebra a página.
type CfgPerfil = {
  lojasPermitidas: string[]; tabelasPermitidas: string[]; pdvLojaId: string | null; pdvDepositoId: string | null
  acessoHoraInicio: string | null; acessoHoraFim: string | null
  acessoBloqSabado: boolean; acessoBloqDomingo: boolean; acessoBloqFeriado: boolean
  metaVendaMensal: number
}
async function configPdvPorPerfil(
  supabase: Awaited<ReturnType<typeof createServiceClient>>
): Promise<Record<string, CfgPerfil>> {
  try {
    const { data } = await supabase.from('perfis').select('id, lojas_permitidas, tabelas_permitidas, pdv_loja_id, pdv_deposito_id, acesso_hora_inicio, acesso_hora_fim, acesso_bloqueia_sabado, acesso_bloqueia_domingo, acesso_bloqueia_feriado, meta_venda_mensal')
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
      }])
    )
  } catch { return {} }
}

export default async function UsuariosPage() {
  const supabase = await createServiceClient()

  // Lista usuários do Auth + perfis
  const [authResult, perfisResult, cargosResult, lojasResult, depositosResult, cfgPdv, tabelasResult] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from('perfis').select('id, nome, permissoes, is_master, ativo, created_at, cargo_id'),
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

  const usuarios = authUsers
    .filter((u) => perfisMap[u.id])
    .map((u) => ({
      id: u.id,
      email: u.email ?? '',
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
      created_at: u.created_at,
    }))

  return <UsuariosClient usuarios={usuarios} cargos={cargos} lojas={lojas} depositos={depositos} tabelas={tabelas} />
}
