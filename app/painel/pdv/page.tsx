import { createServiceClient } from '@/lib/supabase/server'
import { PDVClient } from './PDVClient'

export type PromoInfo = {
  id: string
  nome: string
  tipo: 'valor_direto' | 'leve_x_pague_y' | 'acima_x_pague_y'
  preco_promocional: number | null
  x: number | null
  y: number | null
  valor: number | null
}

export default async function PDVPage() {
  const supabase = await createServiceClient()

  const hoje = new Date().toISOString().split('T')[0]

  const [{ data: produtos }, { data: formas }, { data: pessoas }, { data: depositos }, { data: tabelas }, { data: itensTabela }, { data: seriesEmEstoque }, { data: lojas }, { data: maquinas }] = await Promise.all([
    supabase.from('produtos').select('id, nome, preco, codigo, marca, categoria, descricao, imagem_url, controla_serie, estoque(deposito_id, quantidade)').eq('ativo', true).order('nome'),
    supabase.from('formas_pagamento').select('id, nome, tipo').eq('ativo', true),
    supabase.from('pessoas').select('id, nome, cpf_cnpj, telefone, endereco, bairro, cidade, estado, cep').in('tipo', ['cliente', 'ambos']).order('nome'),
    supabase.from('depositos').select('id, nome, loja_id').order('nome'),
    supabase.from('tabelas_preco').select('id, nome').eq('ativa', true).order('nome'),
    supabase.from('itens_tabela_preco').select('tabela_id, produto_id, preco'),
    supabase.from('numeros_serie').select('produto_id, deposito_id, serie').eq('status', 'em_estoque').order('serie'),
    supabase.from('lojas').select('id, nome, cnpj, telefone, endereco, cidade, uf').eq('ativa', true).order('nome'),
    supabase.from('maquinas_cartao').select('id, nome, taxa_debito, taxas_credito, max_parcelas').eq('ativo', true).order('nome'),
  ])

  // IMEIs disponíveis: { produto_id: { deposito_id: [serie, ...] } }
  const seriesPorProduto: Record<string, Record<string, string[]>> = {}
  for (const s of (seriesEmEstoque ?? []) as { produto_id: string; deposito_id: string; serie: string }[]) {
    if (!s.produto_id || !s.deposito_id) continue
    if (!seriesPorProduto[s.produto_id]) seriesPorProduto[s.produto_id] = {}
    if (!seriesPorProduto[s.produto_id][s.deposito_id]) seriesPorProduto[s.produto_id][s.deposito_id] = []
    seriesPorProduto[s.produto_id][s.deposito_id].push(s.serie)
  }

  // Mapa de preços por tabela: { tabela_id: { produto_id: preco } }
  const precosPorTabela: Record<string, Record<string, number>> = {}
  for (const it of (itensTabela ?? []) as { tabela_id: string; produto_id: string; preco: number }[]) {
    if (!precosPorTabela[it.tabela_id]) precosPorTabela[it.tabela_id] = {}
    precosPorTabela[it.tabela_id][it.produto_id] = it.preco
  }

  // Busca promoções ativas hoje (todos os tipos de uma vez)
  const { data: promocoesAtivas } = await supabase
    .from('promocoes')
    .select('id, nome, tipo, quantidade_x, quantidade_y, valor')
    .eq('ativa', true)
    .lte('data_inicio', hoje)
    .gte('data_fim', hoje)

  const promosAtivas = promocoesAtivas ?? []
  const promoById = new Map(promosAtivas.map(p => [p.id, p]))

  // Mapa unificado: produto_id → todas as promoções ativas que o incluem
  const promosPorProduto: Record<string, PromoInfo[]> = {}
  if (promosAtivas.length > 0) {
    const { data: itensAtivos } = await supabase
      .from('itens_promocao')
      .select('produto_id, preco_promocional, promocao_id')
      .in('promocao_id', promosAtivas.map(p => p.id))

    for (const it of (itensAtivos ?? []) as { produto_id: string; preco_promocional: number | null; promocao_id: string }[]) {
      const promo = promoById.get(it.promocao_id)
      if (!promo) continue
      if (!promosPorProduto[it.produto_id]) promosPorProduto[it.produto_id] = []
      promosPorProduto[it.produto_id].push({
        id: promo.id,
        nome: promo.nome,
        tipo: promo.tipo as PromoInfo['tipo'],
        preco_promocional: it.preco_promocional,
        x: promo.quantidade_x,
        y: promo.quantidade_y,
        valor: promo.valor,
      })
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
          return { id: p.id, nome: p.nome, preco: p.preco, codigo: p.codigo, marca: p.marca, categoria: (p as Record<string, unknown>).categoria as string | null ?? null, descricao: (p as Record<string, unknown>).descricao as string | null ?? null, imagem_url: (p as Record<string, unknown>).imagem_url as string | null ?? null, controla_serie: (p as Record<string, unknown>).controla_serie as boolean | null ?? false, estoquePorDeposito }
        })}
        formas={formasOrdenadas}
        pessoas={pessoas ?? []}
        depositos={depositos ?? []}
        lojas={lojas ?? []}
        maquinas={maquinas ?? []}
        tabelas={tabelas ?? []}
        precosPorTabela={precosPorTabela}
        promosPorProduto={promosPorProduto}
        seriesPorProduto={seriesPorProduto}
      />
    </div>
  )
}
