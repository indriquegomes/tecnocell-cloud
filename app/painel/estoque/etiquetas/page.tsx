import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { EtiquetasClient } from './EtiquetasClient'

export default async function EtiquetasPage() {
  const supabase = await createServiceClient()
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, codigo, ean, preco')
    .eq('ativo', true)
    .order('nome')
    .limit(1000)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/estoque" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Etiquetas</h2>
        <Dica texto="Monte a fila de produtos, defina quantas etiquetas de cada e imprima. Cada etiqueta traz nome, preço e código de barras (EAN ou código do produto) para bipar no PDV." lado="baixo" />
      </div>

      <EtiquetasClient produtos={produtos ?? []} />
    </div>
  )
}
