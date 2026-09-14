import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

const TETO = 300  // mostra no máximo N por lado; filtre pra refinar

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const { data: depositos } = await supabase.from('depositos').select('id, nome').order('nome')
  const PL = (depositos ?? []).find((d) => d.nome === 'PETRÓPOLIS LOJA')?.id
  const PE = (depositos ?? []).find((d) => d.nome === 'PETRÓPOLIS ESTOQUE')?.id
  const TL = (depositos ?? []).find((d) => d.nome === 'TERESÓPOLIS LOJA')?.id
  const TE = (depositos ?? []).find((d) => d.nome === 'TERESÓPOLIS ESTOQUE')?.id
  const petrIds = [PL, PE].filter(Boolean) as string[]
  const terIds = [TL, TE].filter(Boolean) as string[]

  const estoque = await fetchAll((from, to) => supabase.from('estoque')
    .select('produto_id, deposito_id, quantidade, produtos(nome, categoria)')
    .gt('quantidade', 0).range(from, to))

  type Agg = { nome: string; categoria: string | null; pl: number; pe: number; tl: number; te: number }
  const agg = new Map<string, Agg>()
  for (const e of (estoque ?? [])) {
    const pid = e.produto_id as string
    const p = e.produtos as unknown as { nome: string; categoria: string | null } | null
    const cur = agg.get(pid) ?? { nome: p?.nome ?? pid, categoria: p?.categoria ?? null, pl: 0, pe: 0, tl: 0, te: 0 }
    if (e.deposito_id === PL) cur.pl += Number(e.quantidade)
    else if (e.deposito_id === PE) cur.pe += Number(e.quantidade)
    else if (e.deposito_id === TL) cur.tl += Number(e.quantidade)
    else if (e.deposito_id === TE) cur.te += Number(e.quantidade)
    agg.set(pid, cur)
  }

  type Linha = { nome: string; categoria: string | null; qtd: number; detalhe: string }
  const soPetr: Linha[] = []
  const soTer: Linha[] = []
  for (const a of agg.values()) {
    const petr = a.pl + a.pe
    const ter = a.tl + a.te
    if (petr > 0 && ter === 0) soPetr.push({ nome: a.nome, categoria: a.categoria, qtd: petr, detalhe: 'Loja ' + a.pl + ' · Estoque ' + a.pe })
    else if (ter > 0 && petr === 0) soTer.push({ nome: a.nome, categoria: a.categoria, qtd: ter, detalhe: 'Loja ' + a.tl + ' · Estoque ' + a.te })
  }
  soPetr.sort((a, b) => b.qtd - a.qtd)
  soTer.sort((a, b) => b.qtd - a.qtd)

  const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = params.q ? semAcento(params.q) : ''
  const filtra = (arr: Linha[]) => arr.filter((x) => {
    if (params.categoria && x.categoria !== params.categoria) return false
    if (q && !semAcento(x.nome).includes(q)) return false
    return true
  })
  const petrF = filtra(soPetr)
  const terF = filtra(soTer)

  const cats = [...new Set([...soPetr, ...soTer].map((x) => x.categoria).filter((c): c is string => !!c))].sort()

  const Tabela = ({ titulo, cor, linhas }: { titulo: string; cor: string; linhas: Linha[] }) => (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-800">{titulo} <span className="ml-1 text-xs font-normal text-gray-400">{linhas.length} itens</span></h3>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-400">Produto</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase text-gray-400">Qtd</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-400"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">Nada aqui.</td></tr>
            ) : linhas.slice(0, TETO).map((l) => (
              <tr key={l.nome} className="hover:bg-blue-50/40 transition">
                <td className="min-w-0 px-4 py-2 font-medium text-gray-800">
                  <span className="block truncate">{l.nome}</span>
                  {l.categoria && <span className="ml-2 text-[11px] text-gray-400">{l.categoria}</span>}
                  <p className="text-[11px] font-normal text-gray-400">{l.detalhe}</p>
                </td>
                <td className={'px-4 py-2 text-center font-bold tabular-nums ' + cor}>{l.qtd}</td>
                <td className="shrink-0 px-4 py-2 text-right whitespace-nowrap">
                  <Link href={'/painel/estoque/transferencias?produto=' + encodeURIComponent(l.nome)}
                    className="whitespace-nowrap rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition">
                    → Transferir
                  </Link>
                </td>
              </tr>
            ))}
            {linhas.length > TETO && (
              <tr><td colSpan={3} className="px-4 py-2 text-center text-xs text-gray-400">Mostrando {TETO} de {linhas.length} — use o filtro pra refinar.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Comparar lojas</h2>
        <Dica texto="Mostra o que uma cidade tem e a outra não tem (loja + estoque). Daqui você vê a diferença e manda transferir." lado="baixo" />
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-2 text-sm">
        <select name="categoria" defaultValue={params.categoria ?? ''}
          className="rounded border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Todas categorias</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input name="q" defaultValue={params.q ?? ''} placeholder="Buscar produto..."
          className="rounded border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 transition">Filtrar</button>
        {(params.categoria || params.q) && <Link href="/painel/estoque/comparar" className="text-gray-400 hover:text-gray-600">Limpar</Link>}
      </form>

      <div className="grid gap-5 xl:grid-cols-2">
        <Tabela titulo="Só em Petrópolis (falta em Teresópolis)" cor="text-blue-700" linhas={petrF} />
        <Tabela titulo="Só em Teresópolis (falta em Petrópolis)" cor="text-orange-700" linhas={terF} />
      </div>
    </div>
  )
}