'use server'

import { createServiceClient } from '@/lib/supabase/server'

export async function buscarDetalheVendaPublic(vendaId: string) {
  const supabase = await createServiceClient()

  const [vendaRes, itensRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, total, created_at, vendedor_nome, pessoa_nome, deposito_id, forma_pagamento_id')
      .eq('id', vendaId)
      .maybeSingle(),
    supabase
      .from('itens_venda')
      .select('quantidade, preco_unitario, total_item, produtos(nome)')
      .eq('venda_id', vendaId),
  ])

  if (!vendaRes.data) return null
  const v = vendaRes.data as {
    id: string; total: number; created_at: string
    vendedor_nome: string | null; pessoa_nome: string | null
    deposito_id: string | null; forma_pagamento_id: string | null
  }

  const [formaRes, depositoRes] = await Promise.all([
    v.forma_pagamento_id
      ? supabase.from('formas_pagamento').select('nome').eq('id', v.forma_pagamento_id).maybeSingle()
      : Promise.resolve({ data: null }),
    v.deposito_id
      ? supabase.from('depositos').select('nome').eq('id', v.deposito_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    id: v.id,
    total: v.total,
    desconto: 0,
    created_at: v.created_at,
    vendedor_nome: v.vendedor_nome ?? null,
    pessoa_nome: v.pessoa_nome ?? null,
    deposito_nome: (depositoRes as { data: { nome: string } | null }).data?.nome ?? null,
    forma_pagamento_nome: (formaRes as { data: { nome: string } | null }).data?.nome ?? null,
    itens: ((itensRes.data ?? []) as unknown as { quantidade: number; preco_unitario: number; total_item: number; produtos: { nome: string } | null }[]).map((i) => ({
      nome: i.produtos?.nome ?? '—',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      total_item: i.total_item,
    })),
  }
}
