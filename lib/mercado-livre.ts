import { createServiceClient } from '@/lib/supabase/server'

// Cliente da API do Mercado Livre. TUDO que fala com api.mercadolibre.com
// passa por aqui — nunca lê access_token direto do banco em outro lugar.
// Múltiplas contas podem estar conectadas ao mesmo tempo — toda função
// que precisa de token recebe qual conexão usar como parâmetro, nunca
// assume "a" conexão.

const ML_API = 'https://api.mercadolibre.com'
const ML_AUTH = 'https://auth.mercadolivre.com.br'

export type ConexaoML = {
  id: string
  ml_user_id: string
  ml_nickname: string | null
  nome_loja: string | null
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

export async function listarConexoes(): Promise<ConexaoML[]> {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('integracoes_mercado_livre')
    .select('id, ml_user_id, ml_nickname, nome_loja, expira_em')
    .order('conectado_em')
  // Continua devolvendo [] numa falha de consulta (rede, RLS) — quem chama
  // ainda não distingue "sem conta" de "consulta falhou". O log pelo menos
  // deixa rastro pra investigar depois; não impede o efeito colateral.
  if (error) console.error('listarConexoes falhou:', error.message)
  return (data ?? []) as ConexaoML[]
}

export async function buscarConexao(conexaoId: string): Promise<ConexaoML | null> {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('integracoes_mercado_livre')
    .select('id, ml_user_id, ml_nickname, nome_loja, expira_em')
    .eq('id', conexaoId)
    .maybeSingle()
  // Idem: continua virando notFound() no layout da loja numa falha de
  // consulta, como se a conexão tivesse sido apagada — o log só ajuda a
  // diferenciar isso de uma desconexão de verdade quando investigar depois.
  if (error) console.error('buscarConexao falhou:', conexaoId, error.message)
  return (data as ConexaoML | null) ?? null
}

// Devolve um access_token válido pra ESSA conexão, renovando via
// refresh_token se estiver a menos de 5min de expirar. Lança erro se a
// conexão não existir — quem chama decide o que fazer.
export async function tokenValido(conexaoId: string): Promise<string> {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('MERCADOLIVRE_CLIENT_ID/SECRET não configurados')

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('integracoes_mercado_livre')
    .select('*')
    .eq('id', conexaoId)
    .maybeSingle()
  if (error) throw new Error(`Falha ao ler conexão do Mercado Livre: ${error.message}`)
  const conexao = data as LinhaConexao | null
  if (!conexao) throw new Error('Conexão do Mercado Livre não encontrada')

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
  }).eq('id', conexaoId)
  if (updateError) throw new Error(`Falha ao salvar token renovado do Mercado Livre: ${updateError.message}`)

  return novo.access_token
}

// Chamada genérica autenticada à API do Mercado Livre, sempre pra uma
// conexão específica.
export async function chamarML<T>(conexaoId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenValido(conexaoId)
  const resp = await fetch(path.startsWith('http') ? path : `${ML_API}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`Mercado Livre API ${resp.status}: ${await resp.text()}`)
  return resp.json() as Promise<T>
}

type BuscaItensResp = { results: string[]; scroll_id?: string; paging: { total: number; offset: number; limit: number } }
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
// com centenas de anúncios, um por um estourava o tempo da function na Vercel.
export async function buscarDetalhesEmLote(conexaoId: string, ids: string[]): Promise<ItemResp[]> {
  const resultado: ItemResp[] = []
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20)
    const respostas = await chamarML<MultigetResp>(conexaoId, `/items?ids=${lote.join(',')}`)
    for (const r of respostas) {
      if (r.code === 200) resultado.push(r.body)
    }
  }
  return resultado
}

// Busca todos os anúncios ativos do vendedor e devolve o SKU (seller_custom_field,
// ou o atributo SELLER_SKU quando o custom field vem vazio — o Mercado Livre
// migrou pra esse atributo em parte do catálogo).
export async function buscarAnunciosDoVendedor(conexaoId: string, mlUserId: string) {
  // A paginação normal (offset/limit) do ML recusa offset+limit acima de
  // 1000 ("Invalid limit and offset values") — trava vendedores com
  // catálogo grande. search_type=scan + scroll_id não tem esse teto: cada
  // resposta devolve um scroll_id novo pra pedir a próxima página, até
  // vir uma página vazia.
  const ids: string[] = []
  let scrollId: string | undefined
  // Teto de segurança: se o ML devolver um scroll_id que nunca esvazia (ex:
  // scroll expirado sendo reservido), isso evita loop infinito até a
  // function estourar os 60s — 200 páginas de 50 = 10 mil anúncios, folga
  // grande sobre qualquer catálogo real.
  for (let pagina_n = 0; pagina_n < 200; pagina_n++) {
    const query = scrollId
      ? `search_type=scan&scroll_id=${encodeURIComponent(scrollId)}`
      : 'search_type=scan'
    const pagina = await chamarML<BuscaItensResp>(conexaoId, `/users/${mlUserId}/items/search?${query}`)
    if (pagina.results.length === 0) break
    ids.push(...pagina.results)
    scrollId = pagina.scroll_id
    if (!scrollId) break
  }

  const detalhes = await buscarDetalhesEmLote(conexaoId, ids)
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
// derrubar a operação de estoque/venda que já aconteceu de verdade.
// Descobre sozinha qual conexão usar via o conexao_id do próprio anúncio
// — quem chama (PDV, devolução, estoque) nunca precisa saber nada sobre
// contas Mercado Livre.
export async function sincronizarEstoqueML(produtoId: string): Promise<void> {
  try {
    const supabase = await createServiceClient()
    const [{ data: anuncios }, { data: estoque }] = await Promise.all([
      supabase
        .from('integracoes_mercado_livre_anuncios')
        .select('ml_item_id, conexao_id')
        .eq('produto_id', produtoId),
      supabase
        .from('estoque')
        .select('quantidade')
        .eq('produto_id', produtoId)
        .eq('deposito_id', DEPOSITO_PETROPOLIS_LOJA)
        .maybeSingle(),
    ])
    if (!anuncios || anuncios.length === 0) return // produto nao tem anuncio no ML, nada a fazer

    const quantidade = Math.max(0, Math.round(estoque?.quantidade ?? 0))
    // Mesmo produto pode estar anunciado em varias contas ML ao mesmo tempo
    // (o motivo de existir esse plano de multiconta) — atualiza o estoque em
    // CADA anuncio, nao so no primeiro.
    for (const anuncio of anuncios) {
      if (!anuncio.conexao_id) {
        console.error(`Anuncio ML ${anuncio.ml_item_id} do produto ${produtoId} sem conexao_id — pulando`)
        continue
      }
      await chamarML(anuncio.conexao_id, `/items/${anuncio.ml_item_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available_quantity: quantidade }),
      })
    }
  } catch (e) {
    console.error(`Falha ao sincronizar estoque do produto ${produtoId} com o Mercado Livre:`, e)
  }
}

export async function responderPerguntaML(conexaoId: string, mlQuestionId: string, texto: string): Promise<void> {
  await chamarML(conexaoId, '/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: Number(mlQuestionId), text: texto }),
  })
}

type PackMensagensML = { messages: { from: { user_id: number } }[] }

export async function responderMensagemML(conexaoId: string, packId: string, texto: string): Promise<void> {
  // packId vem de um argumento de server action fornecido pelo cliente —
  // valida antes de interpolar na URL do chamarML.
  if (!/^\d+$/.test(packId)) throw new Error('packId inválido')

  const conexao = await buscarConexao(conexaoId)
  if (!conexao) throw new Error('Conexão do Mercado Livre não encontrada')

  // A API de mensagens pós-venda exige `to.user_id` (o comprador) — não dá
  // pra descobrir sem buscar o pack. Mesma chamada que o webhook já usa.
  const pack = await chamarML<PackMensagensML>(
    conexaoId, `/messages/packs/${packId}/sellers/${conexao.ml_user_id}?tag=post_sale&mark_as_read=false`
  )
  const mensagemDoComprador = pack.messages.find((m) => String(m.from.user_id) !== conexao.ml_user_id)
  if (!mensagemDoComprador) throw new Error('Não foi possível identificar o comprador deste pack de mensagens')

  await chamarML(conexaoId, `/messages/packs/${packId}/sellers/${conexao.ml_user_id}?tag=post_sale`, {
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
    // Experimental: parâmetro padrão OAuth2/OIDC pra forçar escolha de conta
    // mesmo com sessão ativa no navegador — não documentado pelo Mercado
    // Livre, sem garantia de que eles respeitam. 'login' sozinho já foi
    // testado (20/08) e não fez efeito; tentando 'select_account' (padrão
    // do Google) antes de aceitar que só dá pra trocar de conta deslogando
    // do Mercado Livre no navegador entre uma conexão e outra.
    prompt: 'select_account',
  })
  return `${ML_AUTH}/authorization?${params.toString()}`
}

export type VendaML = { id: string; numero: number; total: number; created_at: string; ml_order_id: string }
export type PedidoPendenteML = { id: string; ml_order_id: string; motivo: string; criado_em: string; resolvido: boolean }

// Vendas do Mercado Livre + pedidos pagos que finalizar_venda não conseguiu
// processar. Sem conexaoId: agregado de todas as contas (usado por "Meus
// Pedidos" da Central de Integrações). Com conexaoId: só dessa conta
// (usado pela aba "Minhas Vendas" do dashboard por conexão).
export async function buscarVendasML(conexaoId?: string): Promise<{ vendas: VendaML[]; pendentes: PedidoPendenteML[] }> {
  const supabase = await createServiceClient()

  let vendasQuery = supabase
    .from('vendas')
    .select('id, numero, total, created_at, ml_order_id')
    .not('ml_order_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)
  if (conexaoId) vendasQuery = vendasQuery.eq('ml_conexao_id', conexaoId)

  let pendentesQuery = supabase
    .from('integracoes_mercado_livre_pedidos_pendentes')
    .select('id, ml_order_id, motivo, criado_em, resolvido')
    .eq('resolvido', false)
    .order('criado_em', { ascending: false })
  if (conexaoId) pendentesQuery = pendentesQuery.eq('conexao_id', conexaoId)

  const [{ data: vendas, error: erroVendas }, { data: pendentes, error: erroPendentes }] =
    await Promise.all([vendasQuery, pendentesQuery])
  if (erroVendas) console.error('buscarVendasML (vendas) falhou:', conexaoId, erroVendas.message)
  if (erroPendentes) console.error('buscarVendasML (pendentes) falhou:', conexaoId, erroPendentes.message)
  return {
    vendas: (vendas ?? []) as VendaML[],
    pendentes: (pendentes ?? []) as PedidoPendenteML[],
  }
}
