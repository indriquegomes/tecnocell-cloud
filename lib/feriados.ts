import { createServiceClient } from '@/lib/supabase/server'

export const slug = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// É feriado na data, na cidade do funcionário? (nacional 'todas' ou municipal da cidade dele)
// Fonte ÚNICA dessa regra — usar aqui em vez de cada função ter a sua (já divergiram uma vez).
export async function ehFeriado(userId: string, data: string): Promise<boolean> {
  try {
    const s = await createServiceClient()
    const [{ data: perfil }, { data: fers }] = await Promise.all([
      s.from('perfis').select('pdv_loja_id, lojas_permitidas').eq('id', userId).maybeSingle(),
      s.from('feriados').select('cidade').eq('data', data),
    ])
    const lojaId = perfil?.pdv_loja_id ?? (Array.isArray(perfil?.lojas_permitidas) && perfil.lojas_permitidas.length === 1 ? perfil.lojas_permitidas[0] : null)
    const { data: loja } = lojaId ? await s.from('lojas').select('nome').eq('id', lojaId).maybeSingle() : { data: null }
    const cidade = slug(loja?.nome ?? '')
    return (fers ?? []).some((f) => f.cidade === 'todas' || (cidade !== '' && slug(f.cidade) === cidade))
  } catch {
    return false
  }
}
