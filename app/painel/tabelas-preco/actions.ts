'use server'

import { createServiceClient, fetchAll, requirePermissao } from '@/lib/supabase/server'
import { palavrasBusca, aplicaBusca } from '@/lib/busca-produtos'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import ExcelJS from 'exceljs'

// Busca de produto SOB DEMANDA pro picker "adicionar à tabela" (não embutir os
// 7.983 no HTML). Sem acento via busca_norm; fallback por nome/código.
export async function buscarProdutosParaTabela(
  accessToken: string,
  termo: string,
): Promise<{ id: string; nome: string; preco: number; preco_custo: number }[]> {
  await requirePermissao('produtos', accessToken)
  const t = termo.trim()
  if (t.length < 1) return []
  const supabase = await createServiceClient()
  const palavras = palavrasBusca(t)
  if (palavras.length === 0) return []
  let q = supabase.from('produtos').select('id, nome, preco, preco_custo').eq('ativo', true)
  q = aplicaBusca(q, 'busca_norm', palavras)
  let { data, error } = await q.order('nome').limit(15)
  if (error && (error.code === '42703' || error.message?.includes('busca_norm'))) {
    let f = supabase.from('produtos').select('id, nome, preco, preco_custo').eq('ativo', true)
    for (const w of palavras) f = f.or(`nome.ilike.%${w}%,codigo.ilike.%${w}%`)
    ;({ data } = await f.order('nome').limit(15))
  }
  return (data ?? []).map((p) => ({ id: p.id, nome: p.nome, preco: p.preco ?? 0, preco_custo: (p as { preco_custo: number | null }).preco_custo ?? 0 }))
}

export async function criarTabela(formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()

  const data_inicio = (formData.get('data_inicio') as string) || null
  const data_fim = (formData.get('data_fim') as string) || null
  if (data_inicio && data_fim && data_fim < data_inicio) {
    redirect(`/painel/tabelas-preco?erro=${encodeURIComponent('A data final não pode ser antes da data inicial.')}`)
  }
  const nome = (formData.get('nome') as string)?.trim() || ''
  if (!nome) redirect(`/painel/tabelas-preco?erro=${encodeURIComponent('Nome não pode ficar vazio.')}`)

  const { error } = await supabase.from('tabelas_preco').insert({
    nome,
    descricao: formData.get('descricao') as string || null,
    data_inicio,
    data_fim,
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
  const data_inicio = (formData.get('data_inicio') as string) || null
  const data_fim = (formData.get('data_fim') as string) || null
  if (data_inicio && data_fim && data_fim < data_inicio) {
    redirect(`/painel/tabelas-preco/${id}?erro=${encodeURIComponent('A data final não pode ser antes da data inicial.')}`)
  }
  await supabase.from('tabelas_preco').update({ data_inicio, data_fim }).eq('id', id)
  revalidatePath(`/painel/tabelas-preco/${id}`)
  redirect(`/painel/tabelas-preco/${id}`)
}

export async function adicionarItemTabela(tabelaId: string, formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()

  const { error } = await supabase.from('itens_tabela_preco').insert({
    tabela_id: tabelaId,
    produto_id: formData.get('produto_id') as string,
    preco: Math.max(0, parseFloat(formData.get('preco') as string) || 0),
    quantidade_minima: Math.max(1, parseInt(formData.get('quantidade_minima') as string) || 1),
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

  const [produtos, jaExistem] = await Promise.all([
    fetchAll<{ id: string; preco: number | null; preco_custo: number | null }>((from, to) => supabase.from('produtos').select('id, preco, preco_custo').order('id').range(from, to)),
    fetchAll<{ id: string; produto_id: string }>((from, to) => supabase.from('itens_tabela_preco').select('id, produto_id').eq('tabela_id', tabelaId).eq('quantidade_minima', 1).order('id').range(from, to)),
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

// aceita número (célula numérica) ou texto tipo "R$ 1,80" / "1.80"
function parsePreco(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// Importa uma planilha .xlsx (baixada por /exportar e editada) e atualiza os
// preços da tabela em massa. Casa pela coluna "Código". Preço vazio = ignora.
export async function importarPlanilha(tabelaId: string, formData: FormData) {
  await requirePermissao('produtos')
  const file = formData.get('arquivo') as File | null
  if (!file || file.size === 0) return { erro: 'Nenhum arquivo enviado.' }

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    return { erro: 'Arquivo inválido. Envie o .xlsx baixado do sistema.' }
  }
  const ws = wb.worksheets[0]
  if (!ws) return { erro: 'Planilha vazia.' }

  // acha as colunas pelo cabeçalho (linha 1)
  const header = ws.getRow(1)
  let colCod = 0, colPreco = 0
  header.eachCell((cell, col) => {
    const t = String(cell.value ?? '').toLowerCase().trim()
    if (t.startsWith('cód') || t.startsWith('cod')) colCod = col
    if (t.includes('nesta tabela') || t === 'preço' || t === 'preco') colPreco = col
  })
  if (!colCod || !colPreco) return { erro: 'Não achei as colunas "Código" e "Preço nesta tabela" no cabeçalho.' }

  const supabase = await createServiceClient()
  const [produtos, jaExistem] = await Promise.all([
    fetchAll<{ id: string; codigo: string | null }>((from, to) => supabase.from('produtos').select('id, codigo').order('id').range(from, to)),
    fetchAll<{ id: string; produto_id: string }>((from, to) => supabase.from('itens_tabela_preco').select('id, produto_id').eq('tabela_id', tabelaId).eq('quantidade_minima', 1).order('id').range(from, to)),
  ])
  const porCodigo = new Map(produtos.filter((p) => p.codigo).map((p) => [String(p.codigo).trim(), p.id]))
  const itemExistente = new Map(jaExistem.map((i) => [i.produto_id, i.id]))

  let atualizados = 0, adicionados = 0, ignorados = 0, semProduto = 0
  const novos: { tabela_id: string; produto_id: string; preco: number; quantidade_minima: number }[] = []

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cod = String(row.getCell(colCod).value ?? '').trim()
    if (!cod) continue
    const preco = parsePreco(row.getCell(colPreco).value)
    if (preco == null || preco <= 0) { ignorados++; continue }
    const produtoId = porCodigo.get(cod)
    if (!produtoId) { semProduto++; continue }
    const itemId = itemExistente.get(produtoId)
    if (itemId) {
      await supabase.from('itens_tabela_preco').update({ preco }).eq('id', itemId)
      atualizados++
    } else {
      novos.push({ tabela_id: tabelaId, produto_id: produtoId, preco, quantidade_minima: 1 })
      itemExistente.set(produtoId, 'novo') // evita duplicar se o código repetir na planilha
      adicionados++
    }
  }
  for (let i = 0; i < novos.length; i += 500) {
    const { error } = await supabase.from('itens_tabela_preco').insert(novos.slice(i, i + 500))
    if (error) return { erro: `Erro ao gravar: ${error.message}` }
  }

  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
  return { atualizados, adicionados, ignorados, semProduto }
}
