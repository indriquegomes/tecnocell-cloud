import { createServiceClient } from '@/lib/supabase/server'
import { PDVClient } from './PDVClient'

export default async function PDVPage() {
  const supabase = await createServiceClient()

  const hoje = new Date().toISOString().split('T')[0]

  const [{ data: produtos }, { data: formas }, { data: pessoas }, { data: depositos }, { data: tabelas }, { data: itensTabela }, { data: itensPromo }] = await Promise.all([
    supabase.from('produtos').select('id, nome, preco, codigo, marca, categoria, descricao, imagem_url, estoque(deposito_id, quantidade)').eq('ativo', true).order('nome'),
    supabase.from('formas_pagamento').select('id, nome').eq('ativo', true),
    supabase.from('pessoas').select('id, nome, cpf_cnpj, telefone, endereco, bairro, cidade, estado, cep').in('tipo', ['cliente', 'ambos']).order('nome'),
    supabase.from('depositos').select('id, nome').order('nome'),
    supabase.from('tabelas_preco').select('id, nome').eq('ativa', true).order('nome'),
    supabase.from('itens_tabela_preco').select('tabela_id, produto_id, preco'),
    supabase.from('itens_promocao')
      .select('produto_id, preco_promocional, quantidade_x, quantidade_y, promocao_id')
      .not('preco_promocional', 'is', null),
  ])

  // Mapa de preços por tabela: { tabela_id: { produto_id: preco } }
  const precosPorTabela: Record<string, Record<string, number>> = {}
  for (const it of (itensTabela ?? []) as { tabela_id: string; produto_id: string; preco: number }[]) {
    if (!precosPorTabela[it.tabela_id]) precosPorTabela[it.tabela_id] = {}
    precosPorTabela[it.tabela_id][it.produto_id] = it.preco
  }

  // Busca promoções ativas agora para cruzar com itens
  const { data: promocoesAtivas } = await supabase
    .from('promocoes')
    .select('id, tipo, quantidade_x, quantidade_y, valor')
    .eq('ativa', true)
    .eq('tipo', 'valor_direto')
    .lte('data_inicio', hoje)
    .gte('data_fim', hoje)

  const idsPromoAtiva = new Set((promocoesAtivas ?? []).map(p => p.id))

  // Mapa produto_id → preco_promocional (só valor_direto com promoção ativa hoje)
  const precosPromo: Record<string, number> = {}
  for (const it of (itensPromo ?? []) as { produto_id: string; preco_promocional: number | null; promocao_id: string }[]) {
    if (it.preco_promocional != null && idsPromoAtiva.has(it.promocao_id)) {
      precosPromo[it.produto_id] = it.preco_promocional
    }
  }

  // Ordem fixa das formas de pagamento no PDV (as não listadas caem no fim, alfabético)
  const ORDEM_FORMAS = ['PIX', 'Dinheiro', 'Crédito Loja (Fiado)', 'Cartão de Débito', 'Cartão de Crédito']
  const formasOrdenadas = (formas ?? []).slice().sort((a, b) => {
    const ia = ORDEM_FORMAS.indexOf(a.nome)
    const ib = ORDEM_FORMAS.indexOf(b.nome)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.nome.localeCompare(b.nome)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">PDV — Frente de Caixa</h2>
          <p className="text-sm text-gray-400 mt-0.5">{produtos?.length ?? 0} produtos disponíveis</p>
        </div>
      </div>

      <PDVClient
        produtos={(produtos ?? []).map((p) => {
          const linhas = (p.estoque as { deposito_id: string; quantidade: number }[] | null) ?? []
          const estoquePorDeposito: Record<string, number> = {}
          for (const e of linhas) {
            estoquePorDeposito[e.deposito_id] = (estoquePorDeposito[e.deposito_id] ?? 0) + e.quantidade
          }
          return { id: p.id, nome: p.nome, preco: p.preco, codigo: p.codigo, marca: p.marca, categoria: (p as Record<string, unknown>).categoria as string | null ?? null, descricao: (p as Record<string, unknown>).descricao as string | null ?? null, imagem_url: (p as Record<string, unknown>).imagem_url as string | null ?? null, estoquePorDeposito }
        })}
        formas={formasOrdenadas}
        pessoas={pessoas ?? []}
        depositos={depositos ?? []}
        tabelas={tabelas ?? []}
        precosPorTabela={precosPorTabela}
        precosPromo={precosPromo}
      />
    </div>
  )
}
