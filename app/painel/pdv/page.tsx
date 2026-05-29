import { createServiceClient } from '@/lib/supabase/server'
import { PDVClient } from './PDVClient'

export default async function PDVPage() {
  const supabase = await createServiceClient()

  const [{ data: produtos }, { data: formas }, { data: pessoas }] = await Promise.all([
    supabase.from('produtos').select('id, nome, preco, codigo, marca, estoque(quantidade)').eq('ativo', true).order('nome'),
    supabase.from('formas_pagamento').select('id, nome').order('nome'),
    supabase.from('pessoas').select('id, nome').in('tipo', ['cliente', 'ambos']).order('nome'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">PDV � Frente de Caixa</h2>
          <p className="text-sm text-gray-400 mt-0.5">{produtos?.length ?? 0} produtos disponíveis</p>
        </div>
      </div>

      <PDVClient
        produtos={(produtos ?? []).map((p) => ({
          ...p,
          estoque_total: ((p.estoque as { quantidade: number }[] | null) ?? []).reduce((s, e) => s + e.quantidade, 0),
        }))}
        formas={formas ?? []}
        pessoas={pessoas ?? []}
      />
    </div>
  )
}

