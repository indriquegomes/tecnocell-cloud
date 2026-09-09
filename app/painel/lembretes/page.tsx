import { createServiceClient } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/lembretes'
import { LembretesClient } from './LembretesClient'

export default async function LembretesPage() {
  const supabase = await createServiceClient()
  const hoje = hojeSP().data

  const [lembretesRes, perfisRes, cargosRes, feitosRes] = await Promise.all([
    supabase.from('lembretes').select('*').order('hora'),
    supabase.from('perfis').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('cargos').select('id, nome').order('nome'),
    // últimos 7 dias — pra ver quem vem fazendo (e quem não)
    supabase.from('lembretes_feitos').select('lembrete_id, perfil_id, feito_em, data, comprovante_url').gte('data', hoje),
  ])

  // comprovante do pagamento fica no bucket privado `pagamentos` — troca o caminho
  // por uma URL assinada (válida 1h) pra abrir no navegador.
  const feitos = await Promise.all((feitosRes.data ?? []).map(async (f) => {
    if (!f.comprovante_url) return f
    const { data } = await supabase.storage.from('pagamentos').createSignedUrl(f.comprovante_url, 3600)
    return { ...f, comprovante_url: data?.signedUrl ?? f.comprovante_url }
  }))

  return (
    <LembretesClient
      lembretes={lembretesRes.data ?? []}
      perfis={perfisRes.data ?? []}
      cargos={cargosRes.data ?? []}
      feitosHoje={feitos}
    />
  )
}
