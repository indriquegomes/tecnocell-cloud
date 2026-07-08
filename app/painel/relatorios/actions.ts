'use server'

import { createServiceClient, fetchAll, requirePermissao } from '@/lib/supabase/server'

// Export CSV das abas PESADAS de relatório sob demanda: em vez de embutir milhares
// de linhas no HTML, a lista completa só é buscada quando o usuário clica em Exportar.
// A tela mostra só as primeiras ~200 linhas (o número/agregado continua certo).
export async function exportarRelatorio(
  accessToken: string,
  aba: 'precificacao' | 'inventario' | 'contatos' | 'estoque',
): Promise<Record<string, unknown>[]> {
  await requirePermissao('relatorios', accessToken)
  const supabase = await createServiceClient()

  if (aba === 'precificacao') {
    const data = await fetchAll((from, to) => supabase.from('produtos')
      .select('nome, preco, preco_custo, preco_minimo').eq('ativo', true).order('nome').range(from, to))
    return (data ?? []).map((p) => {
      const custo = (p.preco_custo as number) ?? 0, preco = (p.preco as number) ?? 0
      return { nome: p.nome, custo, preco, minimo: (p as { preco_minimo?: number | null }).preco_minimo ?? 0, margem: custo > 0 ? Number(((preco - custo) / custo * 100).toFixed(0)) : 0 }
    })
  }

  if (aba === 'inventario') {
    const data = await fetchAll((from, to) => supabase.from('estoque')
      .select('quantidade, produtos(nome, preco_custo), depositos(nome)').gt('quantidade', 0).range(from, to))
    return (data ?? []).map((e) => ({
      nome: (e.produtos as unknown as { nome: string } | null)?.nome ?? '—',
      deposito: (e.depositos as unknown as { nome: string } | null)?.nome ?? '—',
      sistema: e.quantidade, contagem: '',
      custo: (e.produtos as unknown as { preco_custo: number | null } | null)?.preco_custo ?? 0,
    })).sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
  }

  if (aba === 'contatos') {
    const data = await fetchAll((from, to) => supabase.from('pessoas')
      .select('nome, telefone, celular, cidade, tipo').eq('ativo', true).order('nome').range(from, to))
    return (data ?? []).map((p) => ({
      nome: p.nome, telefone: (p.celular as string) || (p.telefone as string) || '—',
      cidade: (p.cidade as string) || '—', tipo: (p.tipo as string) || '—',
    })).filter((p) => p.telefone !== '—')
  }

  // estoque (por depósito, com custo/venda)
  const data = await fetchAll((from, to) => supabase.from('estoque')
    .select('quantidade, produtos(nome, preco, preco_custo), depositos(nome)').gt('quantidade', 0).range(from, to))
  return (data ?? []).map((e) => {
    const p = e.produtos as unknown as { nome: string; preco: number | null; preco_custo: number | null } | null
    return {
      nome: p?.nome ?? '—', deposito: (e.depositos as unknown as { nome: string } | null)?.nome ?? '—',
      quantidade: e.quantidade, custo: p?.preco_custo ?? 0, preco: p?.preco ?? 0,
    }
  }).sort((a, b) => (b.quantidade * (b.custo as number)) - (a.quantidade * (a.custo as number)))
}
