'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function PedidosFiltros({
  tipo,
  status,
  q,
  loja,
  lojas,
  total,
}: {
  tipo: string
  status: string
  q: string
  loja: string
  lojas: string[]
  total: number
}) {
  const router = useRouter()

  const buildUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams()
    const vals = { tipo, status, q, loja, ...overrides }
    if (vals.tipo) p.set('tipo', vals.tipo)
    if (vals.status) p.set('status', vals.status)
    if (vals.loja) p.set('loja', vals.loja)
    if (vals.q) p.set('q', vals.q)
    return `/painel/pedidos?${p.toString()}`
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Tipo */}
      {([['', 'Todos'], ['orcamento', 'Orçamentos'], ['pedido', 'Pedidos'], ['venda', 'Vendas (PDV)']] as [string, string][]).map(([v, l]) => (
        <Link key={v}
          href={buildUrl({ tipo: v, q: '' })}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition ${tipo === v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          {l}
        </Link>
      ))}

      {/* Status */}
      <select
        value={status}
        onChange={(e) => router.push(buildUrl({ status: e.target.value }))}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400">
        <option value="">Todos os status</option>
        <option value="rascunho">Rascunho</option>
        <option value="aprovado">Aprovado</option>
        <option value="faturado">Faturado</option>
        <option value="cancelado">Cancelado</option>
      </select>

      {/* Loja — só aparece pra quem pode ver mais de uma (gerente/master) */}
      {lojas.length > 1 && (
        <select
          value={loja}
          onChange={(e) => router.push(buildUrl({ loja: e.target.value }))}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Todas as lojas</option>
          {lojas.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      )}

      {/* Busca */}
      <form className="ml-auto flex gap-2" action="/painel/pedidos" method="get">
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        {status && <input type="hidden" name="status" value={status} />}
        {loja && <input type="hidden" name="loja" value={loja} />}
        <input name="q" defaultValue={q} placeholder="Buscar por cliente ou nº..."
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 w-56" />
        <button type="submit"
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition">
          Buscar
        </button>
      </form>

      <span className="text-xs text-gray-400">{total} registros</span>
    </div>
  )
}
