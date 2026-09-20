'use server'

import { createServiceClient, requirePermissao, podeAcao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createHash } from 'node:crypto'

// Extensão do NOME do arquivo (file.name) é o que o cliente digita — só trocar
// "malicioso.html" pra "malicioso.jpg" já bastava antes disso. Bucket "produtos"
// é público: um .html/.svg com <script> vira link real, visitável, hospedado no
// domínio do Supabase. Confirmado em teste 25/08 (mesmo buraco em clientes,
// bucket privado lá, risco menor, mas corrigido igual). Deriva a extensão do
// content-type do arquivo, que também vem do cliente mas pelo menos trava o
// que é aceito numa lista de imagem de verdade — não confia no nome do arquivo.
const EXT_POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
}
async function uploadImagem(supabase: Awaited<ReturnType<typeof createServiceClient>>, file: File, id: string): Promise<string | null> {
  if (!file || file.size === 0) return null
  const ext = EXT_POR_TIPO[file.type]
  if (!ext) return null
  const path = `${id}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await supabase.storage.from('produtos').upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  })
  if (error) return null
  const { data } = supabase.storage.from('produtos').getPublicUrl(path)
  return data.publicUrl
}

// Mesmo uuid5 do importador (carregar-tabela-preco.mjs) — o id do item de tabela é
// determinístico, então o upsert acha o existente em vez de duplicar.
function uuid5(nome: string): string {
  const h = createHash('sha1').update(nome).digest('hex')
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-5' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32)
}

// Grava (upsert) o preço do produto nas 3 tabelas: ATACADO1, ATACADO2, VAREJO.
// CUSTO fica de fora — é sempre o preco_custo do produto (não se digita).
async function salvarPrecosTabela(supabase: Awaited<ReturnType<typeof createServiceClient>>, produtoId: string, formData: FormData) {
  const { data: tabelas } = await supabase.from('tabelas_preco').select('id, nome').in('nome', ['ATACADO1', 'ATACADO2', 'VAREJO'])
  const campoDe = (nome: string) => nome === 'ATACADO1' ? 'preco_atacado1' : nome === 'ATACADO2' ? 'preco_atacado2' : 'preco_varejo'
  const itens = (tabelas ?? []).map((t) => ({
    id: uuid5(`tecnocell:itemtabela:${t.id}:${produtoId}`),
    tabela_id: t.id,
    produto_id: produtoId,
    preco: Math.max(0, parseFloat((formData.get(campoDe(t.nome)) as string) || '0')),
    quantidade_minima: 1,
  }))
  // conflito pela chave natural (tabela_id, produto_id, quantidade_minima) — o mesmo
  // índice único que o trigger da CUSTO usa. Assim nunca duplica: a VAREJO foi importada
  // com id uuid5('tecnocell:itemtabela:VAREJO:<produto>') e bateria errado pelo id.
  const { error } = await supabase.from('itens_tabela_preco').upsert(itens, { onConflict: 'tabela_id,produto_id,quantidade_minima' })
  if (error) console.error('salvarPrecosTabela:', error.message)
}

export async function criarProduto(formData: FormData) {
  await requirePermissao('produtos')
  const podeCusto = await podeAcao('produto_custo')
  const supabase = await createServiceClient()
  // nome só com espaço passa pelo required do HTML5 (não é vazio pro navegador)
  // e virava produto fantasma sem nome de verdade — achado em teste de erros.
  const nomeNovo = (formData.get('nome') as string)?.trim() || ''
  if (!nomeNovo) redirect(`/painel/produtos/novo?erro=${encodeURIComponent('Nome não pode ficar vazio.')}`)
  // evita cadastrar produto com código já existente (duplicidade)
  const codigoNovo = (formData.get('codigo') as string)?.trim() || null
  if (codigoNovo) {
    // Não há constraint única em produtos.codigo no banco — essa checagem é a
    // única coisa que evita duplicidade. Se ela falhar, não dá pra saber se
    // já existe outro com o mesmo código, então trava em vez de arriscar.
    const { data: dup, error: erroDup } = await supabase.from('produtos').select('nome').eq('codigo', codigoNovo).eq('ativo', true).maybeSingle()
    // redirect (não throw): um erro lançado num <form action={...}> sem error
    // boundary derruba a página inteira pra tela genérica "This page couldn't
    // load" — a mensagem amigável nunca chegava a aparecer pro usuário
    // (achado em teste de erros 26/08, testando ao vivo pelo navegador).
    if (erroDup) redirect(`/painel/produtos/novo?erro=${encodeURIComponent('Não deu pra checar se o código já existe: ' + erroDup.message)}`)
    if (dup) redirect(`/painel/produtos/novo?erro=${encodeURIComponent(`Já existe um produto ativo com o código "${codigoNovo}" (${dup.nome}).`)}`)
  }
  const id = crypto.randomUUID()
  const imagemFile = formData.get('imagem') as File | null
  const imagem_url = imagemFile ? await uploadImagem(supabase, imagemFile, id) : null

  const { error } = await supabase.from('produtos').insert({
    id,
    nome: nomeNovo,
    descricao: (formData.get('descricao') as string) || null,
    // Math.max(0, ...): campo de dinheiro é mascarado no form (não digita negativo
    // pela UI normal), mas o valor real vem de um input escondido — alguém manipulando
    // a requisição direto (ou um bug de outro tipo) conseguia mandar negativo sem essa
    // trava. Confirmado em teste 25/08: preço -50 foi aceito e virou produto de verdade.
    preco: Math.max(0, parseFloat((formData.get('preco_varejo') as string) || '0')),
    preco_custo: podeCusto ? Math.max(0, parseFloat((formData.get('preco_custo') as string) || '0')) : 0,
    preco_minimo: podeCusto ? Math.max(0, parseFloat((formData.get('preco_minimo') as string) || '0')) : 0,
    categoria: (formData.get('categoria') as string) || null,
    marca: (formData.get('marca') as string) || null,
    modelo: (formData.get('modelo') as string) || null,
    codigo: (formData.get('codigo') as string) || null,
    ean: (formData.get('ean') as string) || null,
    unidade: (formData.get('unidade') as string) || 'UN',
    fornecedor_id: (formData.get('fornecedor_id') as string) || null,
    prateleira: (formData.get('prateleira') as string) || null,
    estoque_minimo: Math.max(0, parseInt((formData.get('estoque_minimo') as string) || '0', 10)),
    controla_serie: formData.get('controla_serie') === 'true',
    ativo: formData.get('ativo') === 'true',
    visivel_catalogo: formData.get('visivel_catalogo') === 'true',
    imagem_url,
    updated_at: new Date().toISOString(),
  })
  // 23505 = unique_violation. Pega a corrida que a checagem de duplicidade lá em
  // cima não pega sozinha (duas criações quase juntas com o mesmo código passam
  // as duas pela checagem antes de qualquer uma inserir) — migration
  // 2026-08-25-produtos-codigo-unico-ativo.sql trava isso no banco; aqui só troca
  // o erro cru do Postgres por uma mensagem que a pessoa entende.
  if (error) {
    if (error.code === '23505') redirect(`/painel/produtos/novo?erro=${encodeURIComponent(`Já existe um produto ativo com o código "${codigoNovo}".`)}`)
    redirect(`/painel/produtos/novo?erro=${encodeURIComponent(error.message)}`)
  }
  await salvarPrecosTabela(supabase, id, formData)
  revalidatePath('/painel/produtos')
  redirect('/painel/produtos')
}

export async function editarProduto(id: string, formData: FormData) {
  await requirePermissao('produtos')
  const podeCusto = await podeAcao('produto_custo')
  const supabase = await createServiceClient()
  const nomeEditado = (formData.get('nome') as string)?.trim() || ''
  if (!nomeEditado) redirect(`/painel/produtos/${id}/editar?erro=${encodeURIComponent('Nome não pode ficar vazio.')}`)
  const imagemFile = formData.get('imagem') as File | null
  const novaImagem = imagemFile ? await uploadImagem(supabase, imagemFile, id) : undefined

  const updates: Record<string, unknown> = {
    nome: nomeEditado,
    descricao: (formData.get('descricao') as string) || null,
    preco: Math.max(0, parseFloat((formData.get('preco_varejo') as string) || '0')),
    // sem permissão de custo: não mexe no custo nem no piso (preserva os existentes)
    ...(podeCusto ? {
      preco_custo: Math.max(0, parseFloat((formData.get('preco_custo') as string) || '0')),
      preco_minimo: Math.max(0, parseFloat((formData.get('preco_minimo') as string) || '0')),
    } : {}),
    categoria: (formData.get('categoria') as string) || null,
    marca: (formData.get('marca') as string) || null,
    modelo: (formData.get('modelo') as string) || null,
    codigo: (formData.get('codigo') as string) || null,
    ean: (formData.get('ean') as string) || null,
    unidade: (formData.get('unidade') as string) || 'UN',
    fornecedor_id: (formData.get('fornecedor_id') as string) || null,
    prateleira: (formData.get('prateleira') as string) || null,
    estoque_minimo: Math.max(0, parseInt((formData.get('estoque_minimo') as string) || '0', 10)),
    controla_serie: formData.get('controla_serie') === 'true',
    ativo: formData.get('ativo') === 'true',
    visivel_catalogo: formData.get('visivel_catalogo') === 'true',
    updated_at: new Date().toISOString(),
  }
  if (novaImagem) updates.imagem_url = novaImagem

  const { error } = await supabase.from('produtos').update(updates).eq('id', id)
  if (error) {
    // editarProduto nunca checou duplicidade de código antes de salvar (só
    // criarProduto checava) — a trava nova no banco (23505) agora pega isso
    // também, então precisa da mesma mensagem amigável em vez do erro cru.
    // redirect (não throw): mesmo motivo do criarProduto — throw num <form
    // action> sem error boundary derruba a tela inteira (achado 26/08).
    if (error.code === '23505') redirect(`/painel/produtos/${id}/editar?erro=${encodeURIComponent(`Já existe outro produto ativo com o código "${updates.codigo}".`)}`)
    redirect(`/painel/produtos/${id}/editar?erro=${encodeURIComponent(error.message)}`)
  }
  await salvarPrecosTabela(supabase, id, formData)
  revalidatePath('/painel/produtos')
  redirect('/painel/produtos')
}

export async function deletarProduto(id: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('estoque').delete().eq('produto_id', id)
  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/produtos')
}

export async function criarCategoria(nome: string) {
  await requirePermissao('produtos')
  const nomeLimpo = nome.trim()
  if (!nomeLimpo) return
  const supabase = await createServiceClient()
  const hierarquia = nomeLimpo.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  if (!hierarquia) return
  await supabase.from('categorias').upsert({ hierarquia, nome: nomeLimpo, descricao: null }, { onConflict: 'hierarquia' })
  revalidatePath('/painel/produtos')
}

export async function criarMarca(nome: string) {
  await requirePermissao('produtos')
  const nomeLimpo = nome.trim()
  if (!nomeLimpo) return
  const supabase = await createServiceClient()
  await supabase.from('marcas').upsert({ nome: nomeLimpo }, { onConflict: 'nome' })
  revalidatePath('/painel/produtos')
}
