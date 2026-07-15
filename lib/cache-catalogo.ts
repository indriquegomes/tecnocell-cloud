import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

// Cache do CATÁLOGO — categorias, marcas e depósitos aparecem em quase toda tela
// (Produtos, Estoque, Reposição, PDV) e quase nunca mudam. Sem cache, cada tela
// ia no banco buscar tudo de novo, e cada viagem Vercel↔Supabase custa tempo.
//
// Agora ficam guardados por 5 min (revalidate) OU até alguém mexer no cadastro —
// as actions de categoria/marca/depósito chamam revalidateTag() com a tag certa,
// então uma categoria nova aparece na hora, não em 5 min.
//
// createServiceClient() não lê cookies/headers, então é seguro dentro de unstable_cache.

export const getCategoriasCache = unstable_cache(
  async () => {
    const sb = await createServiceClient()
    const { data } = await sb.from('categorias').select('hierarquia, nome').order('nome')
    return data ?? []
  },
  ['catalogo-categorias'],
  { tags: ['categorias'], revalidate: 300 },
)

export const getMarcasCache = unstable_cache(
  async () => {
    const sb = await createServiceClient()
    const { data } = await sb.from('marcas').select('nome').order('nome')
    return data ?? []
  },
  ['catalogo-marcas'],
  { tags: ['marcas'], revalidate: 300 },
)

export const getDepositosCache = unstable_cache(
  async () => {
    const sb = await createServiceClient()
    const { data } = await sb.from('depositos').select('id, nome, loja_id').order('nome')
    return data ?? []
  },
  ['catalogo-depositos'],
  { tags: ['depositos'], revalidate: 300 },
)
