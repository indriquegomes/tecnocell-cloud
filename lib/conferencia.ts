import { createServiceClient, fetchAll } from '@/lib/supabase/server'

// Linha da conferência: produto + saldo atual no depósito escolhido.
// Fonte única da listagem usada pela TELA (on-screen) e pelo EXCEL.
export type LinhaConferencia = {
  id: string
  codigo: string
  gaveta: string
  nome: string
  categoria: string
  saldo: number
  serial: boolean
}

// Busca todos os produtos ativos (filtro de categoria opcional) + o saldo
// atual daquele depósito, e devolve ordenado pela GAVETA (prateleira) em ordem
// numérica: "C - 0036" < "C - 0052" < "G - 0598". Item SEM gaveta cai pro fim,
// em ordem ALFABÉTICA — igual à planilha que já existia.
export async function buscarLinhasConferencia(deposito: string, categoria: string): Promise<LinhaConferencia[]> {
  const supabase = await createServiceClient()

  const produtos = await fetchAll<{ id: string; nome: string; codigo: string | null; prateleira: string | null; controla_serie: boolean | null; categoria: string | null; cat: { nome: string } | null }>(
    (from, to) => {
      let q = supabase.from('produtos')
        .select('id, nome, codigo, prateleira, controla_serie, categoria, cat:categorias!categoria ( nome )')
        .eq('ativo', true)
      if (categoria) q = q.eq('categoria', categoria)
      return q.range(from, to) as unknown as PromiseLike<{ data: { id: string; nome: string; codigo: string | null; prateleira: string | null; controla_serie: boolean | null; categoria: string | null; cat: { nome: string } | null }[] | null }>
    },
  )

  const estoqueRows = await fetchAll<{ produto_id: string; quantidade: number }>(
    (from, to) => supabase.from('estoque').select('produto_id, quantidade').eq('deposito_id', deposito).range(from, to) as unknown as PromiseLike<{ data: { produto_id: string; quantidade: number }[] | null }>,
  )
  const saldoPorProd: Record<string, number> = {}
  for (const e of estoqueRows) saldoPorProd[e.produto_id] = (saldoPorProd[e.produto_id] ?? 0) + Number(e.quantidade)

  return produtos
    .map((p) => ({
      id: p.id,
      codigo: p.codigo ?? '',
      gaveta: p.prateleira ?? '',
      nome: p.nome,
      categoria: p.cat?.nome ?? '',
      serial: !!p.controla_serie,
      saldo: saldoPorProd[p.id] ?? 0,
    }))
    .sort((a, b) => {
      const ga = a.gaveta.trim()
      const gb = b.gaveta.trim()
      if (ga && gb) {
        const c = ga.localeCompare(gb, 'pt-BR', { numeric: true })
        if (c !== 0) return c
      } else if (ga || gb) {
        return ga ? -1 : 1
      }
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })
}
