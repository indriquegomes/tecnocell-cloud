import { createServiceClient } from '@/lib/supabase/server'
import { ConfigForm } from './ConfigForm'

export default async function ConfiguracoesPage() {
  const supabase = await createServiceClient()

  const [{ data: configEmpresa }, { data: configPdv }] = await Promise.all([
    supabase.from('configuracoes').select('valor').eq('chave', 'empresa').maybeSingle(),
    supabase.from('configuracoes').select('valor').eq('chave', 'pdv').maybeSingle(),
  ])

  const dados = (configEmpresa?.valor ?? {}) as Record<string, string>
  const dadosPdv = (configPdv?.valor ?? {}) as Record<string, number>

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Configurações</h2>
      <ConfigForm dados={dados} dadosPdv={dadosPdv} />
    </div>
  )
}
