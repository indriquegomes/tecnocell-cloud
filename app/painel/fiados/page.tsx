import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { FiadosClient } from './FiadosClient'

const semAcento = (s: string) =>
  s.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toUpperCase().trim()

export default async function FiadosPage() {
  const supabase = await createServiceClient()

  const [lancamentos, pessoas] = await Promise.all([
    fetchAll<{ id: string; codigo: number | null; descricao: string | null; pessoa_nome: string | null; valor: number | null; valor_pago: number | null; data_vencimento: string | null; venda_id: string | null }>(
      (from, to) => supabase
        .from('lancamentos')
        .select('id, codigo, descricao, pessoa_nome, valor, valor_pago, data_vencimento, venda_id')
        .eq('tipo', 'receber').eq('status', 'pendente')
        .order('id').range(from, to),
    ),
    fetchAll<{ nome: string; telefone: string | null }>(
      (from, to) => supabase.from('pessoas').select('nome, telefone').order('id').range(from, to),
    ),
  ])

  // telefone por nome normalizado (pra montar o link do WhatsApp)
  const telPorNome = new Map<string, string>()
  for (const p of pessoas) {
    if (p.nome && p.telefone) telPorNome.set(semAcento(p.nome), p.telefone)
  }

  // PEÇAS de cada fiado: puxa os itens das vendas ligadas às notas, pra a cobrança
  // sair com o produto ("2x Frontal iPhone") em vez de "Fiado #152" (pedido da Isa).
  // Em LOTES de 100 ids — .in() com muitos ids estoura a URL do PostgREST ([[bug-in-muitos-ids-url-limit]]).
  const vendaIds = [...new Set(lancamentos.map((l) => l.venda_id).filter(Boolean))] as string[]
  const pecasPorVenda = new Map<string, string[]>()
  // quem vendeu (a CONTA que fez a venda), por venda — pro filtro "quem vendeu".
  // O robô rodou logado como INDRIQUE GOMES, que é uma conta REAL e separada das
  // meninas — então as vendas dele já saem no nome dessa conta. Nada de rótulo
  // "robô" fabricado: cada atendente filtra pelo nome dela e a conta do robô fica
  // numa opção à parte, porque é outra conta.
  const vendedorPorVenda = new Map<string, string>()
  for (let i = 0; i < vendaIds.length; i += 100) {
    const lote = vendaIds.slice(i, i + 100)
    const [{ data: itens }, { data: vendas }] = await Promise.all([
      supabase.from('itens_venda').select('venda_id, quantidade, produtos(nome)').in('venda_id', lote),
      supabase.from('vendas').select('id, vendedor_nome').in('id', lote),
    ])
    for (const it of (itens ?? []) as { venda_id: string; quantidade: number; produtos: { nome: string }[] | { nome: string } | null }[]) {
      const prod = Array.isArray(it.produtos) ? it.produtos[0] : it.produtos
      const nome = prod?.nome?.trim()
      if (!nome) continue
      const arr = pecasPorVenda.get(it.venda_id) ?? []
      arr.push(it.quantidade > 1 ? `${it.quantidade}x ${nome}` : nome)
      pecasPorVenda.set(it.venda_id, arr)
    }
    for (const v of (vendas ?? []) as { id: string; vendedor_nome: string | null }[]) {
      vendedorPorVenda.set(v.id, v.vendedor_nome?.trim() || 'Sem vendedor')
    }
  }

  const hoje = hojeSP()

  // agrupa por cliente + guarda as notas (lançamentos) de cada um
  type Nota = { id: string; codigo: number | null; descricao: string | null; pecas: string | null; vendedor: string; valor: number; vencimento: string | null; venda_id: string | null; vencida: boolean }
  const mapa = new Map<string, { nome: string; total: number; vencido: number; qtd: number; notas: Nota[] }>()
  for (const l of lancamentos) {
    const nome = l.pessoa_nome?.trim() || 'Sem nome'
    const devendo = (l.valor ?? 0) - (l.valor_pago ?? 0)
    if (devendo <= 0.01) continue
    const chave = semAcento(nome)
    const atual = mapa.get(chave) ?? { nome, total: 0, vencido: 0, qtd: 0, notas: [] }
    const vencida = !!(l.data_vencimento && l.data_vencimento.slice(0, 10) < hoje)
    atual.total += devendo
    atual.qtd += 1
    if (vencida) atual.vencido += devendo
    const pecas = l.venda_id ? (pecasPorVenda.get(l.venda_id)?.join(', ') ?? null) : null
    const vendedor = (l.venda_id && vendedorPorVenda.get(l.venda_id)) || 'Sem vendedor'
    atual.notas.push({ id: l.id, codigo: l.codigo, descricao: l.descricao, pecas, vendedor, valor: devendo, vencimento: l.data_vencimento, venda_id: l.venda_id, vencida })
    mapa.set(chave, atual)
  }

  const clientes = [...mapa.entries()]
    .map(([chave, c]) => ({ ...c, telefone: telPorNome.get(chave) ?? null }))
    .sort((a, b) => b.total - a.total)

  const totalReceber = clientes.reduce((s, c) => s + c.total, 0)
  const totalVencido = clientes.reduce((s, c) => s + c.vencido, 0)

  // lista de vendedores que têm fiado em aberto (pro seletor "quem vendeu")
  const vendedores = [...new Set(clientes.flatMap((c) => c.notas.map((n) => n.vendedor)))].sort()

  return (
    <FiadosClient
      clientes={clientes}
      totalReceber={totalReceber}
      totalVencido={totalVencido}
      vendedores={vendedores}
    />
  )
}
