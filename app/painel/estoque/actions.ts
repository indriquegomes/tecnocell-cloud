'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function registrarMovimento(formData: FormData) {
  const user = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const deposito_id = formData.get('deposito_id') as string

  // Produto via datalist: "Nome (codigo)" → busca por nome exato, depois prefixo
  const produtoBusca = (formData.get('produto_busca') as string | null)?.trim() ?? ''
  const nomeBusca = produtoBusca.replace(/\s*\([^)]*\)$/, '').trim()

  let produtoEncontrado: { id: string } | null = null
  if (nomeBusca) {
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

  // quantidade: coluna é integer — Math.round evita erro de tipo no banco
  const quantidade = Math.round(parseFloat(formData.get('quantidade') as string))
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

  const { data: atual } = await supabase
    .from('estoque')
    .select('quantidade')
    .eq('produto_id', produto_id)
    .eq('deposito_id', deposito_id)
    .maybeSingle()

  const qtdAnterior = atual?.quantidade ?? 0
  let qtdNova: number
  if (operacao === 'ajuste') {
    qtdNova = quantidade
  } else if (operacao === 'saida') {
    qtdNova = Math.max(0, qtdAnterior - quantidade)
  } else {
    qtdNova = qtdAnterior + quantidade
  }

  const { error } = await supabase
    .from('estoque')
    .upsert(
      { produto_id, deposito_id, quantidade: qtdNova, updated_at: new Date().toISOString() },
      { onConflict: 'produto_id,deposito_id' }
    )

  if (error) throw new Error(error.message)

  const { error: logError } = await supabase.from('movimentacoes_estoque').insert({
    produto_id,
    deposito_id,
    operacao,
    quantidade,
    qtd_anterior: qtdAnterior,
    qtd_nova: qtdNova,
    observacao,
    criado_por: user.id,
    created_at: createdAt,
  })
  if (logError) throw new Error(`Falha ao registrar histórico: ${logError.message}`)

  revalidatePath('/painel/estoque')
  revalidatePath('/painel/estoque/historico')
  redirect('/painel/estoque/historico')
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

    // Produto serializado: registra cada IMEI (dedup por unique(produto_id,serie)).
    // O estoque cresce só pelo nº de unidades novas efetivamente inseridas.
    const imeis = Array.isArray(item.imeis)
      ? [...new Set(item.imeis.map((s) => s.trim()).filter(Boolean))]
      : []

    const operacao = imeis.length > 0 ? 'entrada' : item.operacao
    let quantidade = imeis.length > 0 ? imeis.length : Math.round(item.quantidade)

    if (imeis.length > 0) {
      const { data: inseridos } = await supabase
        .from('numeros_serie')
        .upsert(
          imeis.map((serie) => ({ produto_id: produtoId, deposito_id, serie, status: 'em_estoque', observacao })),
          { onConflict: 'produto_id,serie', ignoreDuplicates: true }
        )
        .select('id')
      const novos = inseridos?.length ?? 0
      imeisDuplicados += imeis.length - novos
      if (novos === 0) continue // todos já existiam — nada a movimentar
      quantidade = novos
    }

    const { data: atual } = await supabase
      .from('estoque').select('quantidade')
      .eq('produto_id', produtoId).eq('deposito_id', deposito_id).maybeSingle()
    const qtdAnterior = atual?.quantidade ?? 0
    let qtdNova: number
    if (operacao === 'ajuste') qtdNova = quantidade
    else if (operacao === 'saida') qtdNova = Math.max(0, qtdAnterior - quantidade)
    else qtdNova = qtdAnterior + quantidade

    await supabase.from('estoque').upsert(
      { produto_id: produtoId, deposito_id, quantidade: qtdNova, updated_at: new Date().toISOString() },
      { onConflict: 'produto_id,deposito_id' }
    )
    await supabase.from('movimentacoes_estoque').insert({
      produto_id: produtoId, deposito_id, operacao, quantidade,
      qtd_anterior: qtdAnterior, qtd_nova: qtdNova,
      observacao, criado_por: user.id, created_at: createdAt,
    })
  }

  revalidatePath('/painel/estoque')
  revalidatePath('/painel/estoque/historico')

  if (naoEncontrados.length > 0) {
    redirect('/painel/estoque/historico?erro=produto-nao-encontrado')
  }
  if (imeisDuplicados > 0) {
    redirect(`/painel/estoque/historico?aviso=imeis-duplicados&n=${imeisDuplicados}`)
  }
  redirect('/painel/estoque/historico')
}
