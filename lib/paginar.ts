// Paginação do PostgREST — sem dependência do Next, para poder rodar fora da request.
//
// O Supabase/PostgREST devolve no máximo 1000 linhas por consulta: sem paginar, todo
// total que soma mais de mil linhas mente. Estas duas funções são a única forma de
// paginar no projeto; `lib/supabase/server.ts` reexporta as duas, então o import antigo
// (`@/lib/supabase/server`) continua valendo.

export async function fetchAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = []
  // O PostgREST pagina por OFFSET: consulta SEM ORDER BY estável pode devolver a mesma
  // linha em duas páginas. Isso já apareceu como vale-crédito DOBRADO na tela de Fiados
  // (cliente com R$ 18 no extrato mostrado como R$ 36 na cobrança), porque a paginação
  // do extrato de créditos repetia linhas. Deduplicar por `id` mata a linha repetida sem
  // depender de cada chamador lembrar do `.order()`.
  //
  // ponytail: só deduplica linha que TEM id — 90% das tabelas têm, e as que não têm
  // (agregados/RPC) vêm numa página só. A ordem estável continua sendo dever de quem
  // monta a consulta: aqui a linha repetida é descartada, a linha PULADA não volta.
  // (Foi por isso também que o conferente de vale da tela e do banco deu zero em tudo
  // na primeira versão: `pessoas` sem range devolvia só 1000 cadastros.)
  const vistos = new Set<unknown>()
  for (let from = 0; from < 500000; from += 1000) {
    const { data } = await make(from, from + 999)
    if (!data || data.length === 0) break
    for (const linha of data) {
      const id = (linha as { id?: unknown } | null)?.id
      if (id !== undefined && id !== null) {
        if (vistos.has(id)) continue
        vistos.add(id)
      }
      out.push(linha)
    }
    if (data.length < 1000) break
  }
  return out
}

// Como fetchAll, mas fatiando uma lista grande de ids passada a um filtro .in()
// — evita estourar o limite de URL do PostgREST quando são muitos ids (ex: milhares
// de venda_id). Cada lote ainda é paginado por fetchAll. chunkSize conservador p/ UUID.
export async function fetchAllIn<T>(
  ids: string[],
  make: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  chunkSize = 200,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const rows = await fetchAll<T>((from, to) => make(chunk, from, to))
    out.push(...rows)
  }
  return out
}
