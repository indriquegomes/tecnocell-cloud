import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { SeparacaoClient, type ItemSeparacao } from './SeparacaoClient'

export default async function SeparacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServiceClient()

  const { data: remessa } = await supabase
    .from('remessas_estoque')
    .select('id, origem, destino, observacao, created_at, remessas_estoque_itens(id, nome, quantidade, series, produtos(prateleira, codigo))')
    .eq('id', id)
    .single()

  if (!remessa) notFound()

  const { data: depositos } = await supabase.from('depositos').select('id, nome')
  const nomeDep = Object.fromEntries((depositos ?? []).map((d) => [d.id, d.nome]))

  // join aninhado volta OBJETO no runtime, mas o supabase-js sem schema tipado declara como array
  const primeiro = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { prateleira?: string | null; codigo?: string | null } | null | undefined

  const r = remessa as Record<string, unknown>
  const itens: ItemSeparacao[] = ((r.remessas_estoque_itens as Record<string, unknown>[]) ?? []).map((i) => {
    const prod = primeiro(i.produtos)
    const rawSeries = i.series
    const series = Array.isArray(rawSeries)
      ? rawSeries.map((s) => (typeof s === 'string' ? s : (s as { serie?: string }).serie ?? '')).filter(Boolean)
      : []
    return {
      id: String(i.id),
      nome: String(i.nome ?? ''),
      codigo: prod?.codigo ?? null,
      quantidade: Number(i.quantidade) || 0,
      prateleira: prod?.prateleira ?? null,
      series,
    }
  })

  return (
    <SeparacaoClient
      origem={nomeDep[String(r.origem)] ?? String(r.origem)}
      destino={nomeDep[String(r.destino)] ?? String(r.destino)}
      observacao={(r.observacao as string | null) ?? null}
      createdAt={String(r.created_at)}
      itens={itens}
    />
  )
}
