import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/server'

type SB = Awaited<ReturnType<typeof createServiceClient>>

// Estoque a CUSTO (quantidade × preco_custo), por loja, separando VITRINE (depósito
// "LOJA") e FUNDO (depósito "ESTOQUE"). preco_custo vem do cadastro do produto — hoje
// está INFLADO (~R$101k acima do oficial, Petrópolis sozinha +R$83k), então o valor
// ABSOLUTO não serve pra lucro; serve pra medir a VARIAÇÃO mês a mês na mesma régua.
export async function estoqueCustoPorLoja(supabase: SB): Promise<Record<string, { vitrine: number; fundo: number }>> {
  const [{ data: depositos }, linhas] = await Promise.all([
    supabase.from('depositos').select('id, nome, loja_id'),
    fetchAll<any>((from, to) => supabase.from('estoque')
      .select('quantidade, deposito_id, produtos(preco_custo, ativo)')
      .gt('quantidade', 0).range(from, to)),
  ])
  const nomeDe = new Map((depositos ?? []).map((d) => [d.id, d.nome as string]))
  const lojaDe = new Map((depositos ?? []).map((d) => [d.id, d.loja_id as string | null]))
  const out: Record<string, { vitrine: number; fundo: number }> = {}
  for (const e of linhas) {
    const loja = lojaDe.get(e.deposito_id)
    if (!loja) continue
    // Produto DESATIVADO fica fora do valor do estoque — mesma régua do painel
    // (RPC dashboard_resumo). Sem este filtro o "estoque final" do fechamento saía
    // maior que o painel, e a diferença virava a abertura do mês seguinte.
    const produto = e.produtos as { preco_custo?: number | null; ativo?: boolean | null } | null
    if (produto?.ativo === false) continue
    out[loja] ??= { vitrine: 0, fundo: 0 }
    const custo = Number(produto?.preco_custo ?? 0) * Number(e.quantidade ?? 0)
    const nome = (nomeDe.get(e.deposito_id) ?? '').toUpperCase()
    if (nome.includes('LOJA')) out[loja].vitrine += custo
    else out[loja].fundo += custo
  }
  return out
}
