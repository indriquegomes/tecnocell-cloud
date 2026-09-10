'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { sincronizarEstoqueML } from '@/lib/mercado-livre'
import { palavrasBusca, aplicaBusca } from '@/lib/busca-produtos'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Busca de produto SOB DEMANDA pro form de movimentação (não embutir os 7.983 num
// datalist). Sem acento via produtos.busca_norm; fallback por nome/código.
export async function buscarProdutosEstoque(
  accessToken: string,
  termo: string,
): Promise<{ id: string; nome: string; codigo: string | null; controla_serie: boolean; ean: string | null; preco: number }[]> {
  await requirePermissao('estoque', accessToken)
  const t = termo.trim()
  if (t.length < 1) return []
  const supabase = await createServiceClient()
  const palavras = palavrasBusca(t)
  if (palavras.length === 0) return []
  const sel = 'id, nome, codigo, controla_serie, ean, preco'
  let q = supabase.from('produtos').select(sel).eq('ativo', true)
  q = aplicaBusca(q, 'busca_norm', palavras)
  let { data, error } = await q.order('nome').limit(20)
  if (error && (error.code === '42703' || error.message?.includes('busca_norm'))) {
    let f = supabase.from('produtos').select(sel).eq('ativo', true)
    for (const w of palavras) f = f.or(`nome.ilike.%${w}%,codigo.ilike.%${w}%`)
    ;({ data } = await f.order('nome').limit(20))
  }
  return ((data ?? []) as { id: string; nome: string; codigo: string | null; controla_serie: boolean | null; ean: string | null; preco: number | null }[])
    .map((p) => ({ ...p, controla_serie: p.controla_serie ?? false, ean: p.ean ?? null, preco: Number(p.preco) || 0 }))
}

// Sugestão de PRODUTO pro filtro do histórico: label = "código - nome" (pro
// operador identificar), value = nome (o filtro casa por substring no nome).
export async function buscarProdutosFiltro(accessToken: string, termo: string): Promise<{ label: string; value: string }[]> {
  const prods = await buscarProdutosEstoque(accessToken, termo)
  return prods.map((p) => ({ label: p.codigo ? `${p.codigo} - ${p.nome}` : p.nome, value: p.nome }))
}

// Sugestão de CLIENTE/FORNECEDOR pro filtro do histórico. Mesma busca por
// nome_norm do financeiro, mas exige só permissão de estoque (é filtro de estoque).
export async function buscarPessoasFiltro(accessToken: string, termo: string): Promise<{ label: string; value: string }[]> {
  await requirePermissao('estoque', accessToken)
  const raw = termo.trim()
  if (raw.length < 1) return []
  const supabase = await createServiceClient()
  const semAcento = raw.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
  const palavras = semAcento.replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
  if (palavras.length === 0) return []
  let q = supabase.from('pessoas').select('id, nome').eq('ativo', true)
  for (const w of palavras) q = q.ilike('nome_norm', `%${w}%`)
  const { data } = await q.order('nome').limit(15)
  return ((data ?? []) as { id: string; nome: string }[]).map((p) => ({ label: p.nome, value: p.nome }))
}

export async function registrarMovimento(formData: FormData) {
  const user = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const deposito_id = formData.get('deposito_id') as string

  // Produto: prefere o id da busca sob demanda (confiável); senão resolve por nome
  const produtoIdDireto = (formData.get('produto_id') as string | null)?.trim() || null
  const produtoBusca = (formData.get('produto_busca') as string | null)?.trim() ?? ''
  const nomeBusca = produtoBusca.replace(/\s*\([^)]*\)$/, '').trim()

  let produtoEncontrado: { id: string } | null = produtoIdDireto ? { id: produtoIdDireto } : null
  if (!produtoEncontrado && nomeBusca) {
    // 1. match exato (case-insensitive)
    const { data: exato } = await supabase
      .from('produtos').select('id').ilike('nome', nomeBusca).limit(1).maybeSingle()
    // 2. fallback: começa com (cobre variações de sufixo)
    if (!exato) {
      const { data: prefixo } = await supabase
        .from('produtos').select('id').ilike('nome', `${nomeBusca}%`).limit(1).maybeSingle()
      produtoEncontrado = prefixo
    } else {
      produtoEncontrado = exato
    }
  }

  const produto_id = produtoEncontrado?.id ?? null
  if (!produto_id) {
    redirect('/painel/estoque/historico?erro=produto-nao-encontrado')
  }

  // quantidade: coluna é integer — Math.round evita erro de tipo no banco. Math.max(0,
  // ...): negativa aqui inverteria a operação escondido (uma "entrada" negativa vira
  // saída de verdade sem aparecer como saída no histórico) -- o min="0" do form é só
  // client-side, não impede forçar direto na requisição.
  const quantidade = Math.max(0, Math.round(parseFloat(formData.get('quantidade') as string)))
  const operacao = formData.get('operacao') as string
  const notaFiscal = (formData.get('nota_fiscal') as string | null)?.trim() || null
  const obsRaw = (formData.get('observacao') as string | null)?.trim() || null
  const observacao = notaFiscal
    ? obsRaw ? `NF: ${notaFiscal} | ${obsRaw}` : `NF: ${notaFiscal}`
    : obsRaw

  // Data e hora da movimentação (permite backfill)
  const dataMov = formData.get('data_mov') as string | null
  const horarioMov = formData.get('horario_mov') as string | null
  // Trata o horário como hora de Brasília (UTC-3)
  const createdAt = dataMov && horarioMov
    ? new Date(`${dataMov}T${horarioMov}:00-03:00`).toISOString()
    : new Date().toISOString()

  // Movimento atômico (trava a linha; produto serializado exige IMEIs — este
  // form singular não os captura, então cai no erro e orienta usar o de lote)
  const { error } = await supabase.rpc('movimentar_estoque', {
    p_produto_id: produto_id,
    p_deposito_id: deposito_id,
    p_operacao: operacao,
    p_quantidade: quantidade,
    p_series: [],
    p_observacao: observacao,
    p_user: user.id,
    p_created_at: createdAt,
  })
  if (error) redirect(`/painel/estoque/historico?erro=${encodeURIComponent(error.message)}`)
  void sincronizarEstoqueML(produto_id)

  revalidatePath('/painel/estoque')
  revalidatePath('/painel/estoque/historico')
  redirect(`/painel/estoque/historico?ok=${Date.now()}`)
}

export async function criarRemessa(formData: FormData) {
  const user = await requirePermissao('estoque')
  const supabase = await createServiceClient()

  const origem = formData.get('origem_id') as string
  const destino = formData.get('destino_id') as string
  const obs = (formData.get('observacao') as string | null)?.trim() || null

  let itens: { produto_id: string; quantidade: number; series: string[] }[] = []
  try {
    itens = JSON.parse((formData.get('itens') as string) || '[]')
  } catch {}

  if (!origem || !destino) redirect(`/painel/estoque/transferencias?erro=${encodeURIComponent('Selecione origem e destino.')}`)
  if (itens.length === 0) redirect(`/painel/estoque/transferencias?erro=${encodeURIComponent('Adicione ao menos um item.')}`)

  const { error } = await supabase.rpc('criar_remessa_estoque', {
    p_origem: origem,
    p_destino: destino,
    p_itens: itens.map((i) => ({
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      series: [...new Set((i.series ?? []).map((s) => s.trim()).filter(Boolean))].map((serie) => ({ serie })),
    })),
    p_obs: obs,
    p_user: user.id,
  })

  if (error) redirect(`/painel/estoque/transferencias?erro=${encodeURIComponent(error.message)}`)

  revalidatePath('/painel/estoque')
  revalidatePath('/painel/estoque/transferencias')
  revalidatePath('/painel/estoque/historico')
  redirect('/painel/estoque/transferencias?ok=1')
}

// Confirma a chegada física: só agora o destino recebe o estoque.
export async function confirmarRecebimento(id: string) {
  const user = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const { error } = await supabase.rpc('confirmar_recebimento_remessa', { p_remessa_id: id, p_user: user.id })
  if (error) redirect(`/painel/estoque/transferencias?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/estoque')
  revalidatePath('/painel/estoque/transferencias')
  revalidatePath('/painel/estoque/historico')
  redirect('/painel/estoque/transferencias?ok=2')
}

export async function registrarMovimentos(formData: FormData) {
  const user = await requirePermissao('estoque')
  const supabase = await createServiceClient()

  const deposito_id = formData.get('deposito_id') as string
  const dataMov = formData.get('data_mov') as string | null
  const horarioMov = formData.get('horario_mov') as string | null
  const notaFiscal = (formData.get('nota_fiscal') as string | null)?.trim() || null
  const obsRaw = (formData.get('observacao') as string | null)?.trim() || null

  const createdAt = dataMov && horarioMov
    ? new Date(`${dataMov}T${horarioMov}:00-03:00`).toISOString()
    : new Date().toISOString()

  let itens: { produto_busca: string; quantidade: number; operacao: string; imeis?: string[] }[] = []
  try { itens = JSON.parse((formData.get('itens') as string) || '[]') } catch {}

  if (itens.length === 0) {
    redirect('/painel/estoque/historico?erro=sem-itens')
  }

  const naoEncontrados: string[] = []
  let imeisDuplicados = 0
  let erroRpc: string | null = null

  for (const item of itens) {
    const nomeBusca = item.produto_busca.replace(/\s*\([^)]*\)$/, '').trim()

    let produtoId: string | null = null
    const { data: exato } = await supabase
      .from('produtos').select('id').ilike('nome', nomeBusca).limit(1).maybeSingle()
    if (exato) {
      produtoId = exato.id
    } else {
      const { data: prefixo } = await supabase
        .from('produtos').select('id').ilike('nome', `${nomeBusca}%`).limit(1).maybeSingle()
      produtoId = prefixo?.id ?? null
    }

    if (!produtoId) { naoEncontrados.push(nomeBusca); continue }

    const observacao = notaFiscal
      ? obsRaw ? `NF: ${notaFiscal} | ${obsRaw}` : `NF: ${notaFiscal}`
      : obsRaw

    // IMEIs escolhidos (entrada: novos; saída: os que saem)
    const imeis = Array.isArray(item.imeis)
      ? [...new Set(item.imeis.map((s) => s.trim()).filter(Boolean))]
      : []

    // Movimento atômico no RPC (trava a linha; trata numeros_serie p/ serializado)
    const { data, error } = await supabase.rpc('movimentar_estoque', {
      p_produto_id: produtoId,
      p_deposito_id: deposito_id,
      p_operacao: item.operacao,
      p_quantidade: Math.round(item.quantidade),
      p_series: imeis.map((serie) => ({ serie })),
      p_observacao: observacao,
      p_user: user.id,
      p_created_at: createdAt,
    })
    if (error) { erroRpc = error.message; break }
    imeisDuplicados += (data as { duplicados?: number })?.duplicados ?? 0
    void sincronizarEstoqueML(produtoId)
  }

  revalidatePath('/painel/estoque')
  revalidatePath('/painel/estoque/historico')

  if (erroRpc) {
    redirect(`/painel/estoque/historico?erro=${encodeURIComponent(erroRpc)}`)
  }
  if (naoEncontrados.length > 0) {
    redirect('/painel/estoque/historico?erro=produto-nao-encontrado')
  }
  if (imeisDuplicados > 0) {
    redirect(`/painel/estoque/historico?aviso=imeis-duplicados&n=${imeisDuplicados}`)
  }
  redirect(`/painel/estoque/historico?ok=${Date.now()}`)
}
