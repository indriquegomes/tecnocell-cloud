import type { createServiceClient } from '@/lib/supabase/server'

type Item = { venda_id: string; produto_id: string; quantidade: number }
type Devolucao = {
  venda_id: string; valor_total: number; tipo_credito: string
  abate_fiado?: number | null; reembolsos?: { tipo: string; valor: number }[] | null
  pixLegadoSeguro?: boolean
}

export function vendasIntegralmenteDevolvidas(vendidos: Item[], devolvidos: Item[]): Set<string> {
  const quantidades = (itens: Item[]) => {
    const mapa = new Map<string, number>()
    for (const i of itens) {
      const chave = JSON.stringify([i.venda_id, i.produto_id])
      mapa.set(chave, (mapa.get(chave) ?? 0) + Number(i.quantidade))
    }
    return mapa
  }
  const origem = quantidades(vendidos), retorno = quantidades(devolvidos)
  return new Set(vendidos.map(i => i.venda_id).filter(id =>
    [...origem].filter(([chave]) => JSON.parse(chave)[0] === id)
      .every(([chave, qtd]) => (retorno.get(chave) ?? 0) >= qtd)))
}

export function resumirEstornosPix(devolucoes: Devolucao[]): number {
  return Math.round(devolucoes.reduce((s, d) => s + (d.reembolsos
    ? d.reembolsos.filter(r => r.tipo === 'pix').reduce((v, r) => v + Number(r.valor), 0)
    : d.tipo_credito === 'pix' && d.pixLegadoSeguro ? Number(d.valor_total) : 0), 0) * 100) / 100
}

export function aplicarEstornosPix(totalVendas: number, porForma: Record<string, number>, porTipo: Record<string, number>, valor: number): {
  totalVendas: number; porForma: Record<string, number>; porTipo: Record<string, number>
} {
  return { totalVendas: totalVendas - valor,
    porForma: valor ? { ...porForma, 'Estorno PIX': (porForma['Estorno PIX'] ?? 0) - valor } : porForma,
    porTipo: { ...porTipo, pix: (porTipo.pix ?? 0) - valor } }
}

// Uma leitura serve à conferência aberta, relatório X/Z e alerta; só o turno do reembolso recebe a saída.
export async function carregarDevolucoesCaixa(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  caixa: { id: string; aberto_em: string; fechado_em?: string | null }, lojaId: string, vendaIds: string[],
) {
  const { fetchAll, fetchAllIn } = await import('@/lib/supabase/server')
  const fim = caixa.fechado_em ?? new Date().toISOString()
  const [devolucoes, relacionadas, vendidos] = await Promise.all([
    fetchAll<Devolucao & { id: string; caixa_id: string | null }>((from, to) => supabase.from('devolucoes')
      .select('id,venda_id,valor_total,tipo_credito,reembolsos,abate_fiado,caixa_id,depositos!inner(loja_id)')
      .eq('status', 'concluida').eq('depositos.loja_id', lojaId)
      .gte('created_at', caixa.aberto_em).lte('created_at', fim).range(from, to).throwOnError()),
    fetchAllIn<{ id: string; venda_id: string }>(vendaIds, (ids, from, to) => supabase.from('devolucoes')
      .select('id,venda_id').eq('status', 'concluida').in('venda_id', ids).range(from, to).throwOnError()),
    fetchAllIn<Item>(vendaIds, (ids, from, to) => supabase.from('itens_venda')
      .select('venda_id,produto_id,quantidade').in('venda_id', ids).range(from, to).throwOnError()),
  ])
  const itens = await fetchAllIn<{ devolucao_id: string; produto_id: string; quantidade: number }>(relacionadas.map(d => d.id),
    (ids, from, to) => supabase.from('itens_devolucao').select('devolucao_id,produto_id,quantidade').in('devolucao_id', ids).range(from, to).throwOnError())
  const vendaPorDev = new Map(relacionadas.map(d => [d.id, d.venda_id]))
  const turno = devolucoes.filter(d => !d.caixa_id || d.caixa_id === caixa.id)
  // Legado não registra o split: só inferir Pix quando não havia fiado/vale na venda.
  const legadas = turno.filter(d => d.reembolsos == null && d.tipo_credito === 'pix')
  const pags = await fetchAllIn<{ venda_id: string; status: string; valor: number }>(legadas.map(d => d.venda_id),
    (ids, from, to) => supabase.from('pagamentos_venda').select('venda_id,status,valor').in('venda_id', ids).range(from, to).throwOnError())
  for (const d of legadas) {
    const originais = pags.filter(p => p.venda_id === d.venda_id)
    d.pixLegadoSeguro = originais.length > 0 && originais.every(p => p.status === 'pago')
  }
  return { estornosPix: resumirEstornosPix(turno),
    integrais: vendasIntegralmenteDevolvidas(vendidos, itens.map(i => ({ ...i, venda_id: vendaPorDev.get(i.devolucao_id)! }))),
    legadosSemSplit: legadas.filter(d => !d.pixLegadoSeguro).length }
}
