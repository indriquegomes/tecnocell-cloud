'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'

type State = { ok: boolean; erro: string | null }

export async function salvarConfiguracoes(_prev: State, formData: FormData): Promise<State> {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()

  const valorEmpresa = {
    nome_empresa: formData.get('nome_empresa') as string,
    cnpj: formData.get('cnpj') as string,
    telefone: formData.get('telefone') as string,
    endereco: formData.get('endereco') as string,
    cidade: formData.get('cidade') as string,
    estado: formData.get('estado') as string,
    site: formData.get('site') as string,
    moeda: formData.get('moeda') as string,
    timezone: formData.get('timezone') as string,
  }

  const limiteDivergenciaRaw = parseFloat(formData.get('limite_divergencia') as string)
  const valorPdv = {
    limite_divergencia: isNaN(limiteDivergenciaRaw) ? 0 : limiteDivergenciaRaw,
  }

  const [r1, r2] = await Promise.all([
    supabase.from('configuracoes').upsert({ chave: 'empresa', valor: valorEmpresa }, { onConflict: 'chave' }),
    supabase.from('configuracoes').upsert({ chave: 'pdv', valor: valorPdv }, { onConflict: 'chave' }),
  ])

  if (r1.error) return { ok: false, erro: r1.error.message }
  if (r2.error) return { ok: false, erro: r2.error.message }
  return { ok: true, erro: null }
}
