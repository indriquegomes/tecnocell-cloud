import { createServiceClient } from '@/lib/supabase/server'
import { UsuariosClient } from './UsuariosClient'

// Lê a config de PDV do perfil de forma tolerante — se a migration
// (colunas lojas_permitidas/pdv_*) ainda não rodou, não quebra a página.
async function configPdvPorPerfil(
  supabase: Awaited<ReturnType<typeof createServiceClient>>
): Promise<Record<string, { lojasPermitidas: string[]; pdvLojaId: string | null; pdvDepositoId: string | null; caixaNumero: number | null }>> {
  try {
    const { data } = await supabase.from('perfis').select('id, lojas_permitidas, pdv_loja_id, pdv_deposito_id, caixa_numero')
    return Object.fromEntries(
      (data ?? []).map((p) => [p.id, {
        lojasPermitidas: (p.lojas_permitidas ?? []) as string[],
        pdvLojaId: p.pdv_loja_id ?? null,
        pdvDepositoId: p.pdv_deposito_id ?? null,
        caixaNumero: p.caixa_numero ?? null,
      }])
    )
  } catch { return {} }
}

export default async function UsuariosPage() {
  const supabase = await createServiceClient()

  // Lista usuários do Auth + perfis
  const [authResult, perfisResult, cargosResult, lojasResult, depositosResult, cfgPdv] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from('perfis').select('id, nome, permissoes, is_master, ativo, created_at, cargo_id'),
    supabase.from('cargos').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('lojas').select('id, nome').eq('ativa', true).order('nome'),
    supabase.from('depositos').select('id, nome, loja_id').order('nome'),
    configPdvPorPerfil(supabase),
  ])

  const authUsers = authResult.data?.users ?? []
  const perfisMap = Object.fromEntries(
    (perfisResult.data ?? []).map((p) => [p.id, p])
  )
  const cargos = (cargosResult.data ?? []) as { id: string; nome: string }[]
  const lojas = (lojasResult.data ?? []) as { id: string; nome: string }[]
  const depositos = (depositosResult.data ?? []) as { id: string; nome: string; loja_id: string | null }[]

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
      pdvLojaId: cfgPdv[u.id]?.pdvLojaId ?? null,
      pdvDepositoId: cfgPdv[u.id]?.pdvDepositoId ?? null,
      caixaNumero: cfgPdv[u.id]?.caixaNumero ?? null,
      created_at: u.created_at,
    }))

  return <UsuariosClient usuarios={usuarios} cargos={cargos} lojas={lojas} depositos={depositos} />
}
