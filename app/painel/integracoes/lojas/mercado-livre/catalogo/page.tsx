import { createServiceClient } from '@/lib/supabase/server'
import { chamarML } from '@/lib/mercado-livre'

type AnuncioCatalogo = { ml_item_id: string; titulo_ml: string; catalog_product_id: string }
type ProdutoCatalogo = { buy_box_winner: { item_id: string } | null }

// Consulta a API do ML ao vivo, um item de catálogo por vez (sem multiget —
// /products/{id} não tem lote como /items). 60s é o teto do plano Hobby.
export const maxDuration = 60

export default async function CatalogoMLPage() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_anuncios')
    .select('ml_item_id, titulo_ml, catalog_product_id')
    .eq('is_catalogo', true)
  const anuncios = (data ?? []) as AnuncioCatalogo[]

  // Sequencial, não Promise.all: cada chamarML pode disparar renovação de
  // token, e o refresh_token do ML é de uso único — em paralelo, N chamadas
  // corririam pra renovar o mesmo token e só uma venceria.
  const comStatus: (AnuncioCatalogo & { ganhando: boolean | null })[] = []
  for (const a of anuncios) {
    try {
      const produto = await chamarML<ProdutoCatalogo>(`/products/${a.catalog_product_id}`)
      const ganhando = produto.buy_box_winner?.item_id === a.ml_item_id
      comStatus.push({ ...a, ganhando })
    } catch {
      comStatus.push({ ...a, ganhando: null })
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      {comStatus.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhum anúncio de catálogo importado.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {comStatus.map((a) => (
            <li key={a.ml_item_id} className="flex items-center justify-between py-3 text-sm">
              <span className="text-gray-700">{a.titulo_ml}</span>
              {a.ganhando === null ? (
                <span className="text-xs text-gray-400">Não foi possível checar</span>
              ) : (
                <span className={`text-xs font-medium ${a.ganhando ? 'text-green-600' : 'text-red-600'}`}>
                  {a.ganhando ? 'Ganhando' : 'Perdendo'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
