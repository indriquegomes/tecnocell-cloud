'use server'

import { createServiceClient, requirePermissaoAny, fetchAll } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { IMEI_ATIVO } from '@/lib/imei'
import { lerItensDasFotos, casarProdutos, type FotoNota, type ItemCasado } from '@/lib/nota-leitura'

export async function criarNotaEntrada(formData: FormData) {
  await requirePermissaoAny(['compras', 'notas_entrada'])
  const supabase = await createServiceClient()
  // NF é opcional: se vier vazio, gera um número aleatório de 6 dígitos
  // (pra não precisar digitar quando a mercadoria chega sem nota).
  const numeroInformado = ((formData.get('numero') as string) || '').trim()
  const numeroNota = numeroInformado || String(Math.floor(100000 + Math.random() * 900000))
  // Fornecedor obrigatório: é ele que liga cada produto ao fornecedor certo (o
  // nome/marca do produto não basta — vários fornecedores vendem a mesma marca).
  const fornecedorId = ((formData.get('fornecedor_id') as string) || '').trim()
  if (!fornecedorId) {
    redirect(`/painel/compras/nova?erro=${encodeURIComponent('Escolha o fornecedor da nota — é ele que liga os produtos ao fornecedor certo.')}`)
  }
  const { data: nota, error } = await supabase.from('notas_entrada').insert({
    numero: numeroNota,
    fornecedor_id: fornecedorId,
    data_emissao: (formData.get('data_emissao') as string) || null,
    data_entrada: (formData.get('data_entrada') as string) || hojeSP(),
    observacoes: (formData.get('observacoes') as string) || null,
    status: 'pendente',
    valor_total: 0,
  }).select('id').single()
  if (error) redirect(`/painel/compras/nova?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/compras')
  redirect(`/painel/compras/${nota!.id}`)
}

export async function receberNota(id: string) {
  await requirePermissaoAny(['compras', 'notas_entrada'])
  const supabase = await createServiceClient()

  // IMEI/SÉRIE DESLIGADO (decisão do dono, 04/11/2026): a entrada de nota não
  // exige mais número de série. Guarda antiga mantida abaixo, desligada por
  // `IMEI_ATIVO = false` — ligar de volta é só trocar a constante em lib/imei.ts.
  if (IMEI_ATIVO) {
    const { data: itens } = await supabase.from('itens_nota_entrada').select('produto_id, quantidade, series').eq('nota_id', id)
    if (itens && itens.length > 0) {
      const produtoIds = [...new Set(itens.map((i) => i.produto_id).filter(Boolean))] as string[]
      const { data: produtos } = await supabase.from('produtos').select('id, nome, controla_serie').in('id', produtoIds)
      const produtoPorId = new Map((produtos ?? []).map((p) => [p.id, p]))
      for (const item of itens) {
        const produto = item.produto_id ? produtoPorId.get(item.produto_id) : null
        if (!produto?.controla_serie) continue
        const qtdSeries = Array.isArray(item.series) ? item.series.length : 0
        if (qtdSeries !== item.quantidade) {
          redirect(`/painel/compras/${id}?erro=${encodeURIComponent(`"${produto.nome}" controla IMEI: faltam ${item.quantidade - qtdSeries} de ${item.quantidade} pra cadastrar antes de confirmar.`)}`)
        }
      }
    }
  }

  // fornecedor da nota — usado pra ligar cada produto ao fornecedor certo ao receber
  const { data: notaEntrada } = await supabase
    .from('notas_entrada')
    .select('numero, valor_total, fornecedor_id, data_emissao, data_entrada')
    .eq('id', id).maybeSingle()

  // Loja que recebeu: vem do depósito do primeiro item. É lida ANTES do RPC porque a
  // entrada pode mexer nos itens; depois só sobraria chutar a loja.
  const lojaRecebida = await lojaDaNota(supabase, id)

  // entrada atômica no estoque + IMEIs + atualiza custo do produto (tudo ou nada)
  const { error } = await supabase.rpc('receber_nota_entrada', { p_nota_id: id })
  if (error) redirect(`/painel/compras/${id}?erro=${encodeURIComponent(error.message)}`)

  // Liga os produtos desta nota ao fornecedor (fornecedor_id). É o que permite filtrar
  // o financeiro por fornecedor (ex: Inova) sem depender do nome/marca do produto.
  if (notaEntrada?.fornecedor_id) {
    const { data: itensNota } = await supabase.from('itens_nota_entrada').select('produto_id').eq('nota_id', id)
    const produtoIds = [...new Set((itensNota ?? []).map((i) => i.produto_id).filter(Boolean))] as string[]
    if (produtoIds.length > 0) {
      const { error: erroForn } = await supabase.from('produtos').update({ fornecedor_id: notaEntrada.fornecedor_id }).in('id', produtoIds)
      if (erroForn) console.error('receberNota: falha ao ligar fornecedor aos produtos:', erroForn.message)
    }
  }

  // A COMPRA VIROU DÍVIDA. Receber a mercadoria tem que criar a conta a pagar do
  // fornecedor: sem isso o estoque sobe e a dívida não nasce, e o Financeiro passa a
  // mostrar só o que alguém lembrou de digitar à mão.
  await lancarDividaDaNota(supabase, notaEntrada, lojaRecebida)

  revalidatePath('/painel/compras')
  revalidatePath(`/painel/compras/${id}`)
  revalidatePath('/painel/estoque')
  revalidatePath('/painel/financeiro')
}

// Loja dona do depósito que recebeu a nota (null quando a nota ainda não tem item).
async function lojaDaNota(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  notaId: string,
): Promise<string | null> {
  const { data: item } = await supabase
    .from('itens_nota_entrada').select('deposito_id').eq('nota_id', notaId).limit(1).maybeSingle()
  const deposito = (item as { deposito_id?: string | null } | null)?.deposito_id
  if (!deposito) return null
  const { data: dep } = await supabase.from('depositos').select('loja_id').eq('id', deposito).maybeSingle()
  return (dep as { loja_id?: string | null } | null)?.loja_id ?? null
}

// Cria a conta a pagar da nota recebida.
// IDEMPOTENTE de propósito: se já existe lançamento a pagar com a mesma descrição para
// o mesmo fornecedor, não cria outro. Receber a nota duas vezes não pode dobrar a
// dívida — e nota que já foi lançada à mão também não ganha uma segunda linha.
async function lancarDividaDaNota(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  nota: { numero: string | null; valor_total: number | null; fornecedor_id: string | null; data_emissao: string | null; data_entrada: string | null } | null,
  lojaId: string | null,
) {
  if (!nota) return
  const valor = Number(nota.valor_total ?? 0)
  if (valor <= 0) return   // nota sem item lançado não gera dívida

  const descricao = `COMPRA MERCADORIA - NOTA ${nota.numero}`
  const busca = supabase.from('lancamentos').select('id').eq('tipo', 'pagar').eq('descricao', descricao)
  const { data: ja } = nota.fornecedor_id
    ? await busca.eq('pessoa_id', nota.fornecedor_id).maybeSingle()
    : await busca.is('pessoa_id', null).maybeSingle()
  if (ja) return

  const { data: fornecedor } = nota.fornecedor_id
    ? await supabase.from('pessoas').select('nome').eq('id', nota.fornecedor_id).maybeSingle()
    : { data: null }

  const dia = nota.data_emissao ?? nota.data_entrada ?? hojeSP()
  const { error } = await supabase.from('lancamentos').insert({
    id: crypto.randomUUID(),
    descricao,
    valor,
    tipo: 'pagar',
    categoria: 'Mercadoria',
    pessoa_nome: (fornecedor as { nome?: string } | null)?.nome ?? null,
    pessoa_id: nota.fornecedor_id ?? null,
    loja_id: lojaId,
    data_competencia: dia,
    data_vencimento: dia,
    status: 'pendente',
    valor_pago: 0,
    updated_at: new Date().toISOString(),
  })
  // Falha aqui não desfaz o estoque (já entrou) — então avisa no log do servidor,
  // que é onde a equipe olha quando um número do Financeiro não aparece.
  if (error) console.error('receberNota: conta a pagar da nota', nota.numero, 'não foi criada:', error.message)
}

// Salva a lista de IMEIs digitados/lidos pra um item da nota (produto
// controla_serie). Substitui a lista inteira — mais simples que diff.
export async function salvarSeriesItem(itemId: string, notaId: string, series: string[]) {
  await requirePermissaoAny(['compras', 'notas_entrada'])
  const supabase = await createServiceClient()
  const limpas = [...new Set(series.map((s) => s.trim()).filter(Boolean))]
  const { error } = await supabase.from('itens_nota_entrada').update({ series: limpas }).eq('id', itemId)
  if (error) return { ok: false, erro: error.message }
  revalidatePath(`/painel/compras/${notaId}`)
  return { ok: true }
}

export async function estornarNota(id: string) {
  await requirePermissaoAny(['compras', 'notas_entrada'])
  const supabase = await createServiceClient()
  // devolve o estoque e marca cancelada (atômico)
  const { error } = await supabase.rpc('estornar_nota_entrada', { p_nota_id: id })
  if (error) redirect(`/painel/compras/${id}?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/compras')
  revalidatePath(`/painel/compras/${id}`)
  revalidatePath('/painel/estoque')
}

export async function deletarNota(id: string) {
  await requirePermissaoAny(['compras', 'notas_entrada'])
  const supabase = await createServiceClient()
  // nota recebida mexeu no estoque — não pode sumir sem estornar antes
  const { data: nota } = await supabase.from('notas_entrada').select('status').eq('id', id).maybeSingle()
  if (nota?.status === 'recebida') {
    redirect(`/painel/compras?erro=${encodeURIComponent('Esta nota já foi recebida (mexeu no estoque). Estorne a nota antes de excluir.')}`)
  }
  const { error: eItens } = await supabase.from('itens_nota_entrada').delete().eq('nota_id', id)
  if (eItens) redirect(`/painel/compras?erro=${encodeURIComponent(eItens.message)}`)
  const { error } = await supabase.from('notas_entrada').delete().eq('id', id)
  if (error) redirect(`/painel/compras?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/compras')
}

export async function editarNota(id: string, formData: FormData) {
  await requirePermissaoAny(['compras', 'notas_entrada'])
  const supabase = await createServiceClient()
  const { data: nota } = await supabase.from('notas_entrada').select('status').eq('id', id).maybeSingle()
  if (nota?.status !== 'pendente') {
    redirect(`/painel/compras/${id}?erro=${encodeURIComponent('Só dá pra editar uma nota pendente.')}`)
  }
  const { error } = await supabase.from('notas_entrada').update({
    numero: (formData.get('numero') as string)?.trim() || null,
    fornecedor_id: (formData.get('fornecedor_id') as string) || null,
    data_emissao: (formData.get('data_emissao') as string) || null,
    data_entrada: (formData.get('data_entrada') as string) || hojeSP(),
    observacoes: (formData.get('observacoes') as string)?.trim() || null,
  }).eq('id', id)
  if (error) redirect(`/painel/compras/${id}?erro=${encodeURIComponent(error.message)}`)
  revalidatePath(`/painel/compras/${id}`)
  redirect(`/painel/compras/${id}`)
}

export async function removerItemNota(itemId: string, notaId: string) {
  await requirePermissaoAny(['compras', 'notas_entrada'])
  const supabase = await createServiceClient()
  const { error: eDel } = await supabase.from('itens_nota_entrada').delete().eq('id', itemId)
  if (eDel) redirect(`/painel/compras/${notaId}?erro=${encodeURIComponent(eDel.message)}`)
  const { data: itens } = await supabase.from('itens_nota_entrada').select('total_item').eq('nota_id', notaId)
  const total = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  const { error: eTot } = await supabase.from('notas_entrada').update({ valor_total: total }).eq('id', notaId)
  if (eTot) redirect(`/painel/compras/${notaId}?erro=${encodeURIComponent(eTot.message)}`)
  revalidatePath(`/painel/compras/${notaId}`)
}

export async function editarItemNota(itemId: string, notaId: string, formData: FormData) {
  await requirePermissaoAny(['compras', 'notas_entrada'])
  const supabase = await createServiceClient()
  // Math.max: mesmo buraco achado em produtos/financeiro (25/08) -- sem isso dava
  // pra forcar quantidade/preco negativo direto no campo escondido do form.
  const quantidade = Math.max(1, Math.round(parseFloat(formData.get('quantidade') as string)) || 1)
  const preco = Math.max(0, parseFloat(formData.get('preco_unitario') as string) || 0)
  const { error: eUpd } = await supabase.from('itens_nota_entrada')
    .update({ quantidade, preco_unitario: preco, total_item: quantidade * preco })
    .eq('id', itemId)
  if (eUpd) redirect(`/painel/compras/${notaId}?erro=${encodeURIComponent(eUpd.message)}`)
  const { data: itens } = await supabase.from('itens_nota_entrada').select('total_item').eq('nota_id', notaId)
  const total = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  const { error: eTot } = await supabase.from('notas_entrada').update({ valor_total: total }).eq('id', notaId)
  if (eTot) redirect(`/painel/compras/${notaId}?erro=${encodeURIComponent(eTot.message)}`)
  revalidatePath(`/painel/compras/${notaId}`)
}

export async function adicionarItemNota(notaId: string, formData: FormData) {
  await requirePermissaoAny(['compras', 'notas_entrada'])
  const supabase = await createServiceClient()
  // Math.max: mesmo buraco achado em produtos/financeiro (25/08) -- sem isso dava
  // pra forcar quantidade/preco negativo direto no campo escondido do form.
  const quantidade = Math.max(1, Math.round(parseFloat(formData.get('quantidade') as string)) || 1)
  const preco = Math.max(0, parseFloat(formData.get('preco_unitario') as string) || 0)

  const { error: eIns } = await supabase.from('itens_nota_entrada').insert({
    nota_id: notaId,
    produto_id: formData.get('produto_id') as string,
    deposito_id: formData.get('deposito_id') as string,
    quantidade,
    preco_unitario: preco,
    total_item: quantidade * preco,
  })
  if (eIns) throw new Error(eIns.message)

  const { data: itens } = await supabase.from('itens_nota_entrada').select('total_item').eq('nota_id', notaId)
  const total = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  const { error: eTot } = await supabase.from('notas_entrada').update({ valor_total: total }).eq('id', notaId)
  if (eTot) throw new Error(eTot.message)

  revalidatePath(`/painel/compras/${notaId}`)
}

// ── IMPORTAR NOTA POR FOTO ──────────────────────────────────────────────────
// A menina manda as fotos da nota que chegou; o leitor devolve os itens casados
// com o catálogo e a tela mostra tudo editável. A nota SEMPRE nasce PENDENTE —
// receber (mover estoque) continua sendo decisão de gente, no detalhe da nota.

export type LeituraResultado =
  | { ok: true; itens: ItemCasado[] }
  | { ok: false; message: string }

function mimeDaFoto(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) return 'image/webp'
  return 'image/jpeg'
}

export async function lerNotaFotos(_prev: LeituraResultado | null, formData: FormData): Promise<LeituraResultado> {
  try {
    await requirePermissaoAny(['compras', 'notas_entrada'])
    const fotos = (formData.getAll('fotos') as File[]).filter((f) => f && f.size > 0)
    if (!fotos.length) return { ok: false, message: 'Anexe pelo menos uma foto da nota.' }
    const totalBytes = fotos.reduce((s, f) => s + f.size, 0)
    if (totalBytes > 4 * 1024 * 1024) return { ok: false, message: 'As fotos somam mais de 4 MB. Mande menos fotos de uma vez.' }

    const partes: FotoNota[] = []
    for (const f of fotos) {
      const buf = Buffer.from(await f.arrayBuffer())
      const mime = /^image\/(jpeg|png|webp|gif)$/i.test(f.type || '') ? f.type! : mimeDaFoto(buf)
      partes.push({ mime, b64: buf.toString('base64') })
    }

    const itens = await lerItensDasFotos(partes)
    if (!itens.length) {
      return { ok: false, message: 'Não consegui ler itens nesta foto. Confira se está legível e tente de novo — ou lance a nota pela tela normal.' }
    }

    const supabase = await createServiceClient()
    const produtos = await fetchAll<{ id: string; nome: string }>((from, to) =>
      supabase.from('produtos').select('id, nome').eq('ativo', true).order('nome').range(from, to))
    return { ok: true, itens: casarProdutos(itens, produtos) }
  } catch (e) {
    console.error('lerNotaFotos:', e instanceof Error ? e.message : e)
    return { ok: false, message: 'Erro ao ler as fotos. Tente de novo.' }
  }
}

export async function criarNotaDosItens(formData: FormData) {
  await requirePermissaoAny(['compras', 'notas_entrada'])
  const supabase = await createServiceClient()
  const numero = ((formData.get('numero') as string) || '').trim() || String(Math.floor(100000 + Math.random() * 900000))
  const fornecedorId = ((formData.get('fornecedor_id') as string) || '').trim()
  if (!fornecedorId) redirect(`/painel/compras/importar?erro=${encodeURIComponent('Escolha o fornecedor — é ele que liga os itens ao fornecedor certo.')}`)

  // itens chegam como item_<n>_produto / item_<n>_qtd / item_<n>_preco
  const itens: { produto_id: string; quantidade: number; preco_unitario: number }[] = []
  for (let i = 0; i < 500; i++) {
    const produtoId = (formData.get(`item_${i}_produto`) as string | null) || ''
    if (!produtoId) continue
    const quantidade = Math.max(1, Math.round(Number(formData.get(`item_${i}_qtd`)) || 1))
    const preco = Math.max(0, Math.round((Number(String(formData.get(`item_${i}_preco`)).replace(',', '.')) || 0) * 100) / 100)
    itens.push({ produto_id: produtoId, quantidade, preco_unitario: preco })
  }
  if (!itens.length) redirect(`/painel/compras/importar?erro=${encodeURIComponent('Nenhum item para lançar. Escolha o produto das linhas marcadas antes de criar a nota.')}`)

  const depositoId = ((formData.get('deposito_id') as string) || '').trim()
  if (!depositoId) redirect(`/painel/compras/importar?erro=${encodeURIComponent('Escolha a loja/estoque que vai receber a mercadoria.')}`)

  const valorTotal = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const { data: nota, error } = await supabase.from('notas_entrada').insert({
    numero,
    fornecedor_id: fornecedorId,
    data_emissao: (formData.get('data_emissao') as string) || null,
    data_entrada: (formData.get('data_entrada') as string) || hojeSP(),
    observacoes: (formData.get('observacoes') as string) || 'Nota lida por foto no importador',
    status: 'pendente',
    valor_total: valorTotal,
  }).select('id').single()
  if (error) redirect(`/painel/compras/importar?erro=${encodeURIComponent(error.message)}`)

  const { error: eItens } = await supabase.from('itens_nota_entrada').insert(itens.map((i) => ({
    nota_id: nota!.id,
    produto_id: i.produto_id,
    deposito_id: depositoId,
    quantidade: i.quantidade,
    preco_unitario: i.preco_unitario,
    total_item: i.quantidade * i.preco_unitario,
  })))
  if (eItens) {
    // não deixa nota vazia pela metade: se os itens falharem, desfaz a nota
    await supabase.from('notas_entrada').delete().eq('id', nota!.id)
    redirect(`/painel/compras/importar?erro=${encodeURIComponent('Erro ao gravar os itens: ' + eItens.message)}`)
  }

  revalidatePath('/painel/compras')
  redirect(`/painel/compras/${nota!.id}`)
}
