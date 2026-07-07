import { headers } from 'next/headers'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { PDVClient } from './PDVClient'

// Config de PDV do usuário logado (lojas permitidas + padrão). Tolerante:
// se a migration 2026-07-28 não rodou, devolve tudo liberado.
async function configPdvUsuario(supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  try {
    const h = await headers()
    const userId = h.get('x-user-id')
    if (!userId) return null
    const { data } = await supabase.from('perfis')
      .select('lojas_permitidas, tabelas_permitidas, pdv_loja_id, pdv_deposito_id')
      .eq('id', userId).maybeSingle()
    if (!data) return null
    return {
      lojasPermitidas: (data.lojas_permitidas ?? []) as string[],
      tabelasPermitidas: ((data as { tabelas_permitidas?: string[] | null }).tabelas_permitidas ?? []) as string[],
      pdvLojaId: (data.pdv_loja_id ?? null) as string | null,
      pdvDepositoId: (data.pdv_deposito_id ?? null) as string | null,
    }
  } catch { return null }
}

export type PromoInfo = {
  id: string
  nome: string
  tipo: 'valor_direto' | 'progressivo' | 'leve_x_pague_y' | 'acima_x_pague_y'
  preco_promocional: number | null
  x: number | null
  y: number | null
  valor: number | null
  faixas?: { quantidade_minima: number; preco: number }[]  // tipo progressivo
}

export default async function PDVPage() {
  const supabase = await createServiceClient()

  const hoje = new Date().toISOString().split('T')[0]

  // produtos/pessoas/itens passam de 1000 → paginar (PostgREST capa em 1000 por request)
  const [produtos, pessoas, itensTabela, { data: formas }, { data: depositos }, { data: tabelas }, { data: seriesEmEstoque }, { data: lojas }, { data: maquinas }] = await Promise.all([
    fetchAll((from, to) => supabase.from('produtos').select('id, nome, preco, codigo, marca, categoria, descricao, imagem_url, controla_serie, prateleira, estoque(deposito_id, quantidade)').eq('ativo', true).order('nome').range(from, to)),
    fetchAll((from, to) => supabase.from('pessoas').select('id, nome, cpf_cnpj, telefone, endereco, bairro, cidade, estado, cep, tabela_preco_id').eq('ativo', true).in('tipo', ['cliente', 'ambos']).order('nome').range(from, to)),
    fetchAll((from, to) => supabase.from('itens_tabela_preco').select('tabela_id, produto_id, preco, quantidade_minima').range(from, to)),
    supabase.from('formas_pagamento').select('id, nome, tipo, maquina_id, prazo_recebimento').eq('ativo', true),
    supabase.from('depositos').select('id, nome, loja_id').order('nome'),
    supabase.from('tabelas_preco').select('id, nome').eq('ativa', true).or(`data_inicio.is.null,data_inicio.lte.${hoje}`).or(`data_fim.is.null,data_fim.gte.${hoje}`).order('nome'),
    supabase.from('numeros_serie').select('produto_id, deposito_id, serie').eq('status', 'em_estoque').order('serie'),
    supabase.from('lojas').select('id, nome, razao_social, cnpj, inscricao_estadual, telefone, whatsapp, cep, endereco, numero, complemento, bairro, cidade, uf, deposito_padrao_id, tabela_padrao_id, senha_desconto, logo_url, termos_venda').eq('ativa', true).order('nome'),
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

  // Mapa de preços por tabela com faixas: { tabela_id: { produto_id: [{qtd_min, preco}] } }
  // As faixas ficam ordenadas do maior qtd_min pro menor (o PDV pega a 1ª que couber).
  const precosPorTabela: Record<string, Record<string, { qtd_min: number; preco: number }[]>> = {}
  for (const it of (itensTabela ?? []) as { tabela_id: string; produto_id: string; preco: number; quantidade_minima: number | null }[]) {
    if (!precosPorTabela[it.tabela_id]) precosPorTabela[it.tabela_id] = {}
    if (!precosPorTabela[it.tabela_id][it.produto_id]) precosPorTabela[it.tabela_id][it.produto_id] = []
    precosPorTabela[it.tabela_id][it.produto_id].push({ qtd_min: it.quantidade_minima ?? 1, preco: it.preco })
  }
  for (const tab of Object.values(precosPorTabela)) {
    for (const faixas of Object.values(tab)) faixas.sort((a, b) => b.qtd_min - a.qtd_min)
  }

  // Busca promoções ativas hoje (todos os tipos de uma vez)
  const { data: promocoesAtivas } = await supabase
    .from('promocoes')
    .select('id, nome, tipo, quantidade_x, quantidade_y, valor')
    .eq('ativa', true)
    .or(`data_inicio.is.null,data_inicio.lte.${hoje}`)
    .or(`data_fim.is.null,data_fim.gte.${hoje}`)

  const promosAtivas = promocoesAtivas ?? []
  const promoById = new Map(promosAtivas.map(p => [p.id, p]))

  // Faixas das promoções progressivas ativas → mapa promo_id → faixas[]
  const faixasPorPromo: Record<string, { quantidade_minima: number; preco: number }[]> = {}
  const idsProgressivas = promosAtivas.filter(p => p.tipo === 'progressivo').map(p => p.id)
  if (idsProgressivas.length > 0) {
    const { data: faixas } = await supabase
      .from('faixas_promocao')
      .select('promocao_id, quantidade_minima, preco')
      .in('promocao_id', idsProgressivas)
      .order('quantidade_minima')
    for (const f of (faixas ?? []) as { promocao_id: string; quantidade_minima: number; preco: number }[]) {
      ;(faixasPorPromo[f.promocao_id] ??= []).push({ quantidade_minima: f.quantidade_minima, preco: f.preco })
    }
  }

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
        faixas: promo.tipo === 'progressivo' ? (faixasPorPromo[promo.id] ?? []) : undefined,
      })
    }
  }

  // Restrição/padrão de lojas por usuário (Config PDV do perfil)
  const cfg = await configPdvUsuario(supabase)
  let lojasVisiveis = lojas ?? []
  if (cfg?.lojasPermitidas?.length) {
    lojasVisiveis = lojasVisiveis.filter((l) => cfg.lojasPermitidas.includes(l.id))
  }
  // loja padrão do usuário vai pra frente (vira o lojas[0] que o PDV usa de default)
  if (cfg?.pdvLojaId && lojasVisiveis.some((l) => l.id === cfg.pdvLojaId)) {
    lojasVisiveis = [...lojasVisiveis].sort((a, b) => (a.id === cfg.pdvLojaId ? -1 : b.id === cfg.pdvLojaId ? 1 : 0))
  }
  const idsVisiveis = new Set(lojasVisiveis.map((l) => l.id))
  const depositosVisiveis = (depositos ?? []).filter((d) => !d.loja_id || idsVisiveis.has(d.loja_id))

  // Tabelas de preço visíveis pro usuário (vazio = todas; Preço Padrão sempre existe)
  let tabelasVisiveis = tabelas ?? []
  if (cfg?.tabelasPermitidas?.length) {
    tabelasVisiveis = tabelasVisiveis.filter((t) => cfg.tabelasPermitidas.includes(t.id))
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
          return { id: p.id, nome: p.nome, preco: p.preco, codigo: p.codigo, marca: p.marca, categoria: (p as Record<string, unknown>).categoria as string | null ?? null, descricao: (p as Record<string, unknown>).descricao as string | null ?? null, imagem_url: (p as Record<string, unknown>).imagem_url as string | null ?? null, controla_serie: (p as Record<string, unknown>).controla_serie as boolean | null ?? false, prateleira: (p as Record<string, unknown>).prateleira as string | null ?? null, estoquePorDeposito }
        })}
        formas={formasOrdenadas}
        pessoas={pessoas ?? []}
        depositos={depositosVisiveis}
        lojas={lojasVisiveis.map(({ senha_desconto, ...l }) => ({ ...l, exige_senha_desconto: !!senha_desconto }))}
        depositoInicial={cfg?.pdvDepositoId ?? undefined}
        maquinas={maquinas ?? []}
        tabelas={tabelasVisiveis}
        precosPorTabela={precosPorTabela}
        promosPorProduto={promosPorProduto}
        seriesPorProduto={seriesPorProduto}
      />
    </div>
  )
}
