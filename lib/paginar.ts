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
  for (let from = 0; from < 500000; from += 1000) {
    const { data } = await make(from, from + 999)
    if (!data || data.length === 0) break
    out.push(...data)
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
