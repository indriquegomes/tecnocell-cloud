import { createServiceClient, fetchAll, fetchAllIn } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { CreditosClient } from './CreditosClient'

export default async function CreditosClientePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; erro?: string; ok?: string }>
}) {
  const { cliente: clienteFiltro, erro, ok } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: movimentos }, pessoas, { data: lojasData }] = await Promise.all([
    supabase
      .from('creditos_clientes')
      .select('id, pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id, venda_id, lancamento_id, loja_id, created_at')
      .order('created_at', { ascending: false }),
    fetchAll((from, to) => supabase.from('pessoas').select('id, nome').in('tipo', ['cliente', 'ambos']).order('nome').range(from, to)),
    supabase.from('lojas').select('id, nome').order('nome'),
  ])
  const lojaNome: Record<string, string> = Object.fromEntries((lojasData ?? []).map((l) => [l.id, l.nome ?? '—']))

  // Loja ativa da sessão: o saldo de vale NÃO mistura lojas — mostra só a ativa.
  const { ativa } = await lojasDoUsuario()
  const movimentosFiltrados = (movimentos ?? []).filter((m) => !ativa || m.loja_id === ativa.id)

  // Busca detalhes das devoluções referenciadas
  const devolucaoIds = [...new Set(
    movimentosFiltrados.map((m) => m.devolucao_id).filter(Boolean) as string[]
  )]

  const detalhesDevolucao: Record<string, {
    vendaNumero: number | null
    motivo: string | null
    itens: { nome: string; quantidade: number; preco_unitario: number }[]
  }> = {}

  if (devolucaoIds.length > 0) {
    const [{ data: devs }, { data: itens }] = await Promise.all([
      supabase.from('devolucoes').select('id, venda_id, motivo').in('id', devolucaoIds),
      supabase.from('itens_devolucao').select('devolucao_id, nome, quantidade, preco_unitario').in('devolucao_id', devolucaoIds),
    ])

    const vendaIds = (devs ?? []).map((d) => d.venda_id).filter(Boolean) as string[]
    const { data: vendas } = vendaIds.length > 0
      ? await supabase.from('vendas').select('id, numero').in('id', vendaIds)
      : { data: [] }

    const vendaNumeroMap = Object.fromEntries((vendas ?? []).map((v) => [v.id, v.numero]))

    for (const d of devs ?? []) {
      detalhesDevolucao[d.id] = {
        vendaNumero: d.venda_id ? (vendaNumeroMap[d.venda_id] ?? null) : null,
        motivo: d.motivo ?? null,
        itens: (itens ?? [])
          .filter((i) => i.devolucao_id === d.id)
          .map((i) => ({ nome: i.nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario })),
      }
    }
  }

  // Peças da VENDA onde o vale foi usado — o cliente pergunta "o que descontou?".
  const vendaIdsUso = [...new Set(
    movimentosFiltrados.filter((m) => m.tipo === 'uso').map((m) => m.venda_id).filter(Boolean) as string[]
  )]
  const detalhesVenda: Record<string, { numero: number | null; itens: { nome: string; quantidade: number }[] }> = {}
  if (vendaIdsUso.length > 0) {
    const [vendasUso, itensUso] = await Promise.all([
      fetchAllIn<{ id: string; numero: number | null }>(vendaIdsUso, (chunk, from, to) => supabase.from('vendas').select('id, numero').in('id', chunk).range(from, to)),
      fetchAllIn<{ venda_id: string; quantidade: number; produtos: { nome: string } | { nome: string }[] | null }>(vendaIdsUso, (chunk, from, to) => supabase.from('itens_venda').select('venda_id, quantidade, produtos(nome)').in('venda_id', chunk).range(from, to)),
    ])
    const numMap = Object.fromEntries((vendasUso ?? []).map((v) => [v.id, v.numero]))
    for (const it of itensUso) {
      const prod = Array.isArray(it.produtos) ? it.produtos[0] : it.produtos
      const nome = prod?.nome
      if (!nome) continue
      if (!detalhesVenda[it.venda_id]) detalhesVenda[it.venda_id] = { numero: numMap[it.venda_id] ?? null, itens: [] }
      detalhesVenda[it.venda_id].itens.push({ nome, quantidade: it.quantidade })
    }
  }

  // Fiados quitados com vale — resolve nº/codigo/cliente pra não mostrar o UUID cru
  const lancamentoIdsUso = [...new Set(
    movimentosFiltrados.filter((m) => m.tipo === 'uso').map((m) => m.lancamento_id).filter(Boolean) as string[]
  )]
  const detalhesFiado: Record<string, { codigo: number | null; descricao: string | null; pessoa_nome: string | null }> = {}
  if (lancamentoIdsUso.length > 0) {
    const lans = await fetchAllIn<{ id: string; codigo: number | null; descricao: string | null; pessoa_nome: string | null }>(
      lancamentoIdsUso,
      (chunk, from, to) => supabase.from('lancamentos').select('id, codigo, descricao, pessoa_nome').in('id', chunk).range(from, to),
    )
    for (const l of lans) detalhesFiado[l.id] = { codigo: l.codigo, descricao: l.descricao, pessoa_nome: l.pessoa_nome }
  }

  // Agrupa por pessoa e calcula saldo
  type Mov = NonNullable<typeof movimentos>[number]
  const mapaPessoa: Record<string, {
    id: string
    nome: string
    loja: string
    saldo: number
    movimentos: Mov[]
  }> = {}

  for (const m of movimentosFiltrados) {
    if (!m.pessoa_id) continue
    const chave = m.pessoa_id + '|' + (m.loja_id ?? '')
    if (!mapaPessoa[chave]) {
      mapaPessoa[chave] = { id: chave, nome: m.pessoa_nome ?? '—', loja: lojaNome[m.loja_id ?? ''] ?? '—', saldo: 0, movimentos: [] }
    }
    // 'uso' e 'estorno' saem (−); 'credito' entra (+). Estorno cancela um crédito.
    if (m.tipo === 'uso' || m.tipo === 'estorno') mapaPessoa[chave].saldo -= m.valor ?? 0
    else mapaPessoa[chave].saldo += m.valor ?? 0
    mapaPessoa[chave].movimentos.push(m)
  }

  const clientes = Object.values(mapaPessoa)
    .filter((c) => c.saldo > 0.01 || c.movimentos.some((m) => m.tipo !== 'uso'))
    .sort((a, b) => b.saldo - a.saldo)

  const totalEmCirculacao = clientes.reduce((s, c) => s + Math.max(0, c.saldo), 0)

  return (
    <CreditosClient
      clientes={clientes}
      pessoas={pessoas ?? []}
      lojas={(lojasData ?? []) as { id: string; nome: string }[]}
      totalEmCirculacao={totalEmCirculacao}
      clienteFiltroInicial={clienteFiltro ?? ''}
      detalhesDevolucao={detalhesDevolucao}
      detalhesVenda={detalhesVenda}
      detalhesFiado={detalhesFiado}
      erro={erro}
      ok={ok}
    />
  )
}
