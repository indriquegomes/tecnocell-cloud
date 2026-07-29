import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { DevolucoesClient, type ItemDevolucaoLinha } from './DevolucoesClient'

export default async function DevolucoesPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; q?: string; venda?: string; loja?: string }>
}) {
  const { de, ate, q, venda, loja } = await searchParams
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
        tipo_credito, motivo, motivo_tipo, valor_total, created_at,
        itens_devolucao ( id, nome, quantidade, preco_unitario, total_item, status_produto )
      `)
      .gte('created_at', dataInicio + 'T00:00:00')
      .lte('created_at', dataFim + 'T23:59:59')
      .order('created_at', { ascending: false })
      .range(from, to))

  // Loja da devolução = loja da VENDA original (venda→caixa→loja). O depósito tem
  // loja NULL em alguns, então vem do caixa. Regra por permissão. Adendo Isa 29/07.
  const { todasLojas, permitidas, todas: vemTodas } = await lojasDoUsuario()
  const nomesPermitidos = permitidas.map(l => l.nome)
  const vendaIds = [...new Set((devRaw as { venda_id?: string | null }[]).map(d => d.venda_id).filter(Boolean))] as string[]
  const { data: vendasData } = vendaIds.length
    ? await supabase.from('vendas').select('id, caixa_id').in('id', vendaIds)
    : { data: [] as { id: string; caixa_id: string | null }[] }
  const caixaIds = [...new Set((vendasData ?? []).map(v => v.caixa_id).filter(Boolean))] as string[]
  const { data: caixasData } = caixaIds.length
    ? await supabase.from('caixas').select('id, loja_id').in('id', caixaIds)
    : { data: [] as { id: string; loja_id: string | null }[] }
  const nomeLoja: Record<string, string> = Object.fromEntries(todasLojas.map(l => [l.id, l.nome]))
  const lojaDoCaixa: Record<string, string | null> = Object.fromEntries((caixasData ?? []).map(c => [c.id, c.loja_id]))
  const caixaDaVenda: Record<string, string | null> = Object.fromEntries((vendasData ?? []).map(v => [v.id, v.caixa_id]))
  const lojaDaVenda = (vid: string | null): string => {
    const cx = vid ? caixaDaVenda[vid] : null
    const lj = cx ? lojaDoCaixa[cx] : null
    return lj ? (nomeLoja[lj] ?? '') : ''
  }

  // Flatten: uma linha por item devolvido (padrão SIGE)
  const linhas: ItemDevolucaoLinha[] = []
  for (const dev of devRaw as never[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = dev as any
    const lojaDev = lojaDaVenda(d.venda_id ?? null)
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
        motivo_tipo:    d.motivo_tipo ?? null,
        status_produto: item.status_produto ?? 'ok',
        loja:           lojaDev,
      })
    }
  }

  const linhasVisiveis = linhas.filter(l =>
    (vemTodas || !l.loja || nomesPermitidos.includes(l.loja)) &&
    (!loja || l.loja === loja))

  return (
    <DevolucoesClient
      linhas={linhasVisiveis}
      lojas={nomesPermitidos}
      filtros={{ de: dataInicio, ate: dataFim, q: q ?? '', loja: loja ?? '' }}
      vendaInicial={venda ?? null}
    />
  )
}
