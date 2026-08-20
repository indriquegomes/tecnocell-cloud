import { createServiceClient } from '@/lib/supabase/server'

// Cliente da API do Mercado Livre. TUDO que fala com api.mercadolibre.com
// passa por aqui — nunca lê access_token direto do banco em outro lugar.
// Conexão é singleton (id sempre 'principal', ver migration).

const ML_API = 'https://api.mercadolibre.com'
const ML_AUTH = 'https://auth.mercadolivre.com.br'

export type ConexaoML = {
  ml_user_id: string
  ml_nickname: string | null
  expira_em: string
}

type LinhaConexao = {
  id: string
  ml_user_id: string
  ml_nickname: string | null
  access_token: string
  refresh_token: string
  expira_em: string
}

export async function conexaoAtual(): Promise<ConexaoML | null> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre')
    .select('ml_user_id, ml_nickname, expira_em')
    .eq('id', 'principal')
    .maybeSingle()
  return (data as ConexaoML | null) ?? null
}

// Devolve um access_token válido, renovando via refresh_token se estiver a
// menos de 5min de expirar. Lança erro se não houver conexão — quem chama
// decide o que fazer (webhook grava pendência, tela mostra "conecte primeiro").
export async function tokenValido(): Promise<string> {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('MERCADOLIVRE_CLIENT_ID/SECRET não configurados')

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('integracoes_mercado_livre')
    .select('*')
    .eq('id', 'principal')
    .maybeSingle()
  if (error) throw new Error(`Falha ao ler conexão do Mercado Livre: ${error.message}`)
  const conexao = data as LinhaConexao | null
  if (!conexao) throw new Error('Mercado Livre não está conectado')

  const expiraEm = new Date(conexao.expira_em).getTime()
  const cincoMinutos = 5 * 60 * 1000
  if (expiraEm - Date.now() > cincoMinutos) return conexao.access_token

  const resp = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conexao.refresh_token,
    }),
  })
  if (!resp.ok) throw new Error(`Falha ao renovar token do Mercado Livre: ${await resp.text()}`)
  const novo = await resp.json() as { access_token: string; refresh_token: string; expires_in: number }

  // refresh_token do ML é de uso único — se este update falhar, o banco fica
  // com o refresh_token antigo (já queimado) e a próxima renovação quebra em
  // silêncio. Por isso lança em vez de devolver o token como se tivesse persistido.
  const { error: updateError } = await supabase.from('integracoes_mercado_livre').update({
    access_token: novo.access_token,
    refresh_token: novo.refresh_token,
    expira_em: new Date(Date.now() + novo.expires_in * 1000).toISOString(),
    atualizado_em: new Date().toISOString(),
  }).eq('id', 'principal')
  if (updateError) throw new Error(`Falha ao salvar token renovado do Mercado Livre: ${updateError.message}`)

  return novo.access_token
}

// Chamada genérica autenticada à API do Mercado Livre.
export async function chamarML<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenValido()
  const resp = await fetch(path.startsWith('http') ? path : `${ML_API}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`Mercado Livre API ${resp.status}: ${await resp.text()}`)
  return resp.json() as Promise<T>
}

type BuscaItensResp = { results: string[]; paging: { total: number; offset: number; limit: number } }
export type ItemResp = {
  id: string
  title: string
  price: number
  seller_custom_field: string | null
  attributes?: { id: string; value_name: string | null }[]
  catalog_listing?: boolean
  catalog_product_id?: string | null
  status: string
  sub_status: string[]
}

type MultigetResp = { code: number; body: ItemResp }[]

// Pega os detalhes de até 20 anúncios numa chamada só (multiget da API do ML —
// GET /items?ids=... — em vez de um GET /items/{id} por item). Pra um vendedor
// com centenas de anúncios, um por um estourava o tempo da function na Vercel
// (importar anúncios travava em "Importando..." pra sempre, e o painel de
// "Aguardando Ajuste" do Dashboard tinha o mesmo problema). Reaproveitada
// pelos dois — mesmo endpoint, só muda o que cada um lê do corpo do item.
export async function buscarDetalhesEmLote(ids: string[]): Promise<ItemResp[]> {
  const resultado: ItemResp[] = []
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20)
    const respostas = await chamarML<MultigetResp>(`/items?ids=${lote.join(',')}`)
    for (const r of respostas) {
      if (r.code === 200) resultado.push(r.body)
    }
  }
  return resultado
}

// Busca todos os anúncios ativos do vendedor e devolve o SKU (seller_custom_field,
// ou o atributo SELLER_SKU quando o custom field vem vazio — o Mercado Livre
// migrou pra esse atributo em parte do catálogo).
export async function buscarAnunciosDoVendedor(mlUserId: string) {
  const ids: string[] = []
  let offset = 0
  const limite = 50
  while (true) {
    const pagina = await chamarML<BuscaItensResp>(
      `/users/${mlUserId}/items/search?offset=${offset}&limit=${limite}`
    )
    if (pagina.results.length === 0) break
    ids.push(...pagina.results)
    offset += limite
    if (offset >= pagina.paging.total) break
  }

  const detalhes = await buscarDetalhesEmLote(ids)
  return detalhes.map((item) => {
    const skuAtributo = item.attributes?.find((a) => a.id === 'SELLER_SKU')?.value_name ?? null
    return {
      ml_item_id: item.id,
      titulo: item.title,
      preco: item.price,
      sku: item.seller_custom_field ?? skuAtributo,
      catalogo: item.catalog_listing ?? false,
      catalogProductId: item.catalog_product_id ?? null,
    }
  })
}

export const DEPOSITO_PETROPOLIS_LOJA = '63d9054d59a9c829747233d4'

// Chamar depois de QUALQUER mudança em estoque do depósito Petrópolis Loja
// (venda de balcão, devolução, ajuste manual, venda do próprio Mercado
// Livre). Fire-and-forget por design: nunca deixa uma falha na API do ML
// derrubar a operação de estoque/venda que já aconteceu de verdade —
// mesmo princípio já usado neste projeto pra escrita de caixa na
// devolução (ver app/painel/devolucoes/actions.ts).
export async function sincronizarEstoqueML(produtoId: string): Promise<void> {
  try {
    const conexao = await conexaoAtual()
    if (!conexao) return // nao conectado, nada a fazer

    const supabase = await createServiceClient()
    const [{ data: anuncio }, { data: estoque }] = await Promise.all([
      supabase
        .from('integracoes_mercado_livre_anuncios')
        .select('ml_item_id')
        .eq('produto_id', produtoId)
        .maybeSingle(),
      supabase
        .from('estoque')
        .select('quantidade')
        .eq('produto_id', produtoId)
        .eq('deposito_id', DEPOSITO_PETROPOLIS_LOJA)
        .maybeSingle(),
    ])
    if (!anuncio) return // produto nao tem anuncio no ML, nada a fazer

    const quantidade = Math.max(0, Math.round(estoque?.quantidade ?? 0))
    await chamarML(`/items/${anuncio.ml_item_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_quantity: quantidade }),
    })
  } catch (e) {
    console.error(`Falha ao sincronizar estoque do produto ${produtoId} com o Mercado Livre:`, e)
  }
}

export async function responderPerguntaML(mlQuestionId: string, texto: string): Promise<void> {
  await chamarML('/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: Number(mlQuestionId), text: texto }),
  })
}

type PackMensagensML = { messages: { from: { user_id: number } }[] }

export async function responderMensagemML(packId: string, texto: string): Promise<void> {
  // packId vem de um argumento de server action fornecido pelo cliente —
  // valida antes de interpolar na URL do chamarML.
  if (!/^\d+$/.test(packId)) throw new Error('packId inválido')

  const conexao = await conexaoAtual()
  if (!conexao) throw new Error('Mercado Livre não está conectado')

  // A API de mensagens pós-venda exige `to.user_id` (o comprador) — não dá
  // pra descobrir sem buscar o pack. Mesma chamada que o webhook já usa.
  const pack = await chamarML<PackMensagensML>(
    `/messages/packs/${packId}/sellers/${conexao.ml_user_id}?tag=post_sale&mark_as_read=false`
  )
  const mensagemDoComprador = pack.messages.find((m) => String(m.from.user_id) !== conexao.ml_user_id)
  if (!mensagemDoComprador) throw new Error('Não foi possível identificar o comprador deste pack de mensagens')

  await chamarML(`/messages/packs/${packId}/sellers/${conexao.ml_user_id}?tag=post_sale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: { user_id: Number(conexao.ml_user_id) },
      to: { user_id: mensagemDoComprador.from.user_id },
      text: texto,
    }),
  })
}

export function urlAutorizacao(state: string, codeChallenge: string, redirectUri: string): string {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID
  if (!clientId) throw new Error('MERCADOLIVRE_CLIENT_ID/SECRET não configurados')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    // Experimental: parâmetro padrão OAuth2/OIDC pra forçar a tela de login
    // mesmo com sessão ativa no navegador — não documentado pelo Mercado
    // Livre, sem garantia de que eles respeitam. Se não fizer efeito, tira
    // essa linha (não quebra o fluxo hoje, o ML deve simplesmente ignorar).
    prompt: 'login',
  })
  return `${ML_AUTH}/authorization?${params.toString()}`
}

export type VendaML = { id: string; numero: number; total: number; created_at: string; ml_order_id: string }
export type PedidoPendenteML = { id: string; ml_order_id: string; motivo: string; criado_em: string; resolvido: boolean }

// Vendas do Mercado Livre + pedidos pagos que finalizar_venda não conseguiu
// processar (ver integracoes_mercado_livre_pedidos_pendentes). Usada tanto
// em "Meus Pedidos" (Central de Integrações) quanto na aba "Minhas Vendas"
// do dashboard desta loja — mesma consulta, um lugar só.
export async function buscarVendasML(): Promise<{ vendas: VendaML[]; pendentes: PedidoPendenteML[] }> {
  const supabase = await createServiceClient()
  const [{ data: vendas }, { data: pendentes }] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, created_at, ml_order_id')
      .not('ml_order_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('integracoes_mercado_livre_pedidos_pendentes')
      .select('id, ml_order_id, motivo, criado_em, resolvido')
      .eq('resolvido', false)
      .order('criado_em', { ascending: false }),
  ])
  return {
    vendas: (vendas ?? []) as VendaML[],
    pendentes: (pendentes ?? []) as PedidoPendenteML[],
  }
}
