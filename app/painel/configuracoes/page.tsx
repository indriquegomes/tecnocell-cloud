import { createServiceClient } from '@/lib/supabase/server'
import { ConfigForm } from './ConfigForm'

export default async function ConfiguracoesPage() {
  const supabase = await createServiceClient()

  const { data: config } = await supabase
    .from('configuracoes')
    .select('*')
    .eq('chave', 'empresa')
    .single()

  const dados = (config?.valor ?? {}) as Record<string, string>

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">ConfiguraÃ§Ãµes</h2>
      <ConfigForm dados={dados} />
    </div>
  )
}

