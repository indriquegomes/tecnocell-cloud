'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarTabela(formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()

  const { error } = await supabase.from('tabelas_preco').insert({
    nome: formData.get('nome') as string,
    descricao: formData.get('descricao') as string || null,
    data_inicio: (formData.get('data_inicio') as string) || null,
    data_fim: (formData.get('data_fim') as string) || null,
    ativa: true,
  })

  if (error) redirect(`/painel/tabelas-preco?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/tabelas-preco')
  redirect('/painel/tabelas-preco?ok=1')
}

export async function deletarTabela(id: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  // não deixa apagar tabela vinculada a cliente (deixaria o cliente órfão)
  const { count } = await supabase.from('pessoas').select('id', { count: 'exact', head: true }).eq('tabela_preco_id', id)
  if ((count ?? 0) > 0) {
    redirect(`/painel/tabelas-preco?erro=${encodeURIComponent(`Esta tabela está vinculada a ${count} cliente(s). Desvincule antes de excluir.`)}`)
  }
  // remove os itens da tabela junto (senão o vínculo trava)
  await supabase.from('itens_tabela_preco').delete().eq('tabela_id', id)
  await supabase.from('tabelas_preco').delete().eq('id', id)
  revalidatePath('/painel/tabelas-preco')
  redirect('/painel/tabelas-preco')
}

export async function atualizarVigencia(id: string, formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('tabelas_preco').update({
    data_inicio: (formData.get('data_inicio') as string) || null,
    data_fim: (formData.get('data_fim') as string) || null,
  }).eq('id', id)
  revalidatePath(`/painel/tabelas-preco/${id}`)
  redirect(`/painel/tabelas-preco/${id}`)
}

export async function adicionarItemTabela(tabelaId: string, formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()

  const { error } = await supabase.from('itens_tabela_preco').insert({
    tabela_id: tabelaId,
    produto_id: formData.get('produto_id') as string,
    preco: parseFloat(formData.get('preco') as string) || 0,
    quantidade_minima: parseInt(formData.get('quantidade_minima') as string) || 1,
  })

  if (error) return { error: /duplicate|unique/i.test(error.message) ? 'Já existe uma faixa com essa quantidade mínima pra esse produto.' : error.message }
  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
  return { ok: true }
}

export async function removerItemTabela(id: string, tabelaId: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('itens_tabela_preco').delete().eq('id', id)
  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
  redirect(`/painel/tabelas-preco/${tabelaId}`)
}

export async function atualizarPrecoItem(id: string, tabelaId: string, preco: number) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const { error } = await supabase
    .from('itens_tabela_preco')
    .update({ preco })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
}

export async function importarTodosComMultiplicador(
  tabelaId: string,
  multiplicador: number,
  base: 'venda' | 'custo' = 'venda',
  arredondamento: 'nenhum' | '90' | '99' = 'nenhum',
  atualizar = false,
) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()

  const [{ data: produtos }, { data: jaExistem }] = await Promise.all([
    supabase.from('produtos').select('id, preco, preco_custo'),
    supabase.from('itens_tabela_preco').select('id, produto_id').eq('tabela_id', tabelaId).eq('quantidade_minima', 1),
  ])

  const existente = new Map((jaExistem ?? []).map((i) => [i.produto_id, i.id]))
  const arredondar = (x: number) => {
    let v = Math.round(x * 100) / 100
    if (arredondamento === '90' || arredondamento === '99') {
      const centavos = arredondamento === '90' ? 0.90 : 0.99
      let r = Math.floor(v) + centavos
      if (r < v - 0.001) r += 1
      v = Math.round(r * 100) / 100
    }
    return v
  }

  let count = 0
  const novos: { tabela_id: string; produto_id: string; preco: number; quantidade_minima: number }[] = []
  for (const p of produtos ?? []) {
    const baseVal = base === 'custo' ? (p.preco_custo ?? 0) : (p.preco ?? 0)
    if (baseVal <= 0) continue
    const preco = arredondar(baseVal * multiplicador)
    const id = existente.get(p.id)
    if (id) {
      if (atualizar) { await supabase.from('itens_tabela_preco').update({ preco }).eq('id', id); count++ }
    } else {
      novos.push({ tabela_id: tabelaId, produto_id: p.id, preco, quantidade_minima: 1 })
    }
  }
  if (novos.length > 0) {
    const { error } = await supabase.from('itens_tabela_preco').insert(novos)
    if (error) throw new Error(error.message)
    count += novos.length
  }

  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
  return count
}

export async function toggleTabela(id: string, ativa: boolean) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('tabelas_preco').update({ ativa }).eq('id', id)
  revalidatePath(`/painel/tabelas-preco/${id}`)
  revalidatePath('/painel/tabelas-preco')
}
