'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'

export type StatusOS = 'aberta' | 'em_andamento' | 'aguardando_peca' | 'pronta' | 'entregue' | 'cancelada'

export interface OrdemServico {
  id: string
  numero: number
  pessoa_nome: string | null
  pessoa_id: string | null
  equipamento: string
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  defeito_relatado: string | null
  observacoes: string | null
  status: StatusOS
  total: number
  tecnico_nome: string | null
  created_at: string
  itens_count: number
}

export interface NovaOSInput {
  pessoa_nome: string
  pessoa_id: string | null
  equipamento: string
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  defeito_relatado: string
  observacoes: string | null
  tecnico_nome: string | null
}

export async function criarOS(accessToken: string, input: NovaOSInput): Promise<{ id: string; numero: number }> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()

  const { data: ultimo } = await supabase
    .from('ordens_servico')
    .select('numero')
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()

  const numero = (ultimo?.numero ?? 0) + 1

  const { data, error } = await supabase
    .from('ordens_servico')
    .insert({
      numero,
      pessoa_nome: input.pessoa_nome || 'Cliente Final',
      pessoa_id: input.pessoa_id,
      equipamento: input.equipamento,
      marca: input.marca || null,
      modelo: input.modelo || null,
      numero_serie: input.numero_serie || null,
      defeito_relatado: input.defeito_relatado,
      observacoes: input.observacoes || null,
      tecnico_nome: input.tecnico_nome || null,
      status: 'aberta',
      total: 0,
    })
    .select('id, numero')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function atualizarStatusOS(
  accessToken: string,
  osId: string,
  status: StatusOS,
): Promise<void> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const { error } = await supabase
    .from('ordens_servico')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', osId)
  if (error) throw new Error(error.message)
}

export async function buscarClientes(
  accessToken: string,
  busca: string,
): Promise<{ id: string; nome: string; telefone: string | null }[]> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('pessoas')
    .select('id, nome, telefone')
    .or(`tipo.eq.cliente,tipo.eq.ambos`)
    .ilike('nome', `%${busca}%`)
    .limit(10)
  return (data ?? []) as { id: string; nome: string; telefone: string | null }[]
}
