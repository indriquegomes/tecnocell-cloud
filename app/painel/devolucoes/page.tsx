import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { DevolucoesClient, type ItemDevolucaoLinha } from './DevolucoesClient'

export default async function DevolucoesPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; q?: string }>
}) {
  const { de, ate, q } = await searchParams
  const supabase = await createServiceClient()

  const hoje = hojeSP()
  const inicioMes = hoje.slice(0, 8) + '01'
  const dataInicio = de ?? inicioMes
  const dataFim = ate ?? hoje

  // fetchAll: antes capava em 300 e os totais (itens/valor/nº devoluções) subcontavam
  // quando o período passava disso.
  const devRaw = await fetchAll<unknown>((from, to) =>
    supabase
      .from('devolucoes')
      .select(`
        id, venda_id, pessoa_nome, vendedor_nome,
        tipo_credito, motivo, valor_total, created_at,
        itens_devolucao ( id, nome, quantidade, preco_unitario, total_item, status_produto )
      `)
      .gte('created_at', dataInicio + 'T00:00:00')
      .lte('created_at', dataFim + 'T23:59:59')
      .order('created_at', { ascending: false })
      .range(from, to))

  // Flatten: uma linha por item devolvido (padrão SIGE)
  const linhas: ItemDevolucaoLinha[] = []
  for (const dev of devRaw as never[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = dev as any
    const itens = d.itens_devolucao ?? []
    for (const item of itens) {
      linhas.push({
        item_id:      item.id,
        devolucao_id: d.id,
        venda_id:     d.venda_id ?? null,
        created_at:   d.created_at,
        pessoa_nome:  d.pessoa_nome ?? null,
        operador:     d.vendedor_nome ?? null,
        produto_nome: item.nome,
        quantidade:   item.quantidade,
        preco_unit:   item.preco_unitario,
        total_item:   item.total_item,
        tipo_credito:   d.tipo_credito,
        motivo:         d.motivo ?? null,
        status_produto: item.status_produto ?? 'ok',
      })
    }
  }

  const totalItens  = linhas.reduce((s, l) => s + l.quantidade, 0)
  const totalValor  = linhas.reduce((s, l) => s + l.total_item, 0)
  const nDevolucoes = new Set(linhas.map(l => l.devolucao_id)).size

  return (
    <DevolucoesClient
      linhas={linhas}
      totalItens={totalItens}
      totalValor={totalValor}
      nDevolucoes={nDevolucoes}
      filtros={{ de: dataInicio, ate: dataFim, q: q ?? '' }}
    />
  )
}
