import Link from 'next/link'

// Paginação padrão do sistema. Server component — só monta os links preservando
// os outros parâmetros (busca, filtros, ordem). Página 1 não vai na URL.
export function Paginacao({
  pagina,
  totalPaginas,
  total,
  params = {},
  basePath,
}: {
  pagina: number
  totalPaginas: number
  total: number
  params?: Record<string, string>
  basePath: string
}) {
  if (totalPaginas <= 1) return (
    <div className="px-4 py-3 text-xs text-gray-400">{total} registro{total === 1 ? '' : 's'}</div>
  )

  const link = (p: number) => {
    const sp = new URLSearchParams(params)
    if (p <= 1) sp.delete('pagina')
    else sp.set('pagina', String(p))
    const qs = sp.toString()
    return basePath + (qs ? `?${qs}` : '')
  }

  const win = 2
  const de = Math.max(1, pagina - win)
  const ate = Math.min(totalPaginas, pagina + win)
  const nums: number[] = []
  for (let i = de; i <= ate; i++) nums.push(i)

  const btn = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm transition'
  const normal = 'border-gray-200 text-gray-600 hover:bg-gray-50'
  const ativo = 'border-blue-600 bg-blue-600 text-white'
  const off = 'pointer-events-none opacity-40'

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3">
      <span className="text-xs text-gray-400">
        {total} registro{total === 1 ? '' : 's'} · página {pagina} de {totalPaginas}
      </span>
      <div className="flex items-center gap-1">
        <Link href={link(pagina - 1)} className={`${btn} ${pagina <= 1 ? off : normal}`} aria-label="Anterior">‹</Link>
        {de > 1 && (
          <>
            <Link href={link(1)} className={`${btn} ${normal}`}>1</Link>
            {de > 2 && <span className="px-1 text-gray-400">…</span>}
          </>
        )}
        {nums.map((n) => (
          <Link key={n} href={link(n)} className={`${btn} ${n === pagina ? ativo : normal}`}>{n}</Link>
        ))}
        {ate < totalPaginas && (
          <>
            {ate < totalPaginas - 1 && <span className="px-1 text-gray-400">…</span>}
            <Link href={link(totalPaginas)} className={`${btn} ${normal}`}>{totalPaginas}</Link>
          </>
        )}
        <Link href={link(pagina + 1)} className={`${btn} ${pagina >= totalPaginas ? off : normal}`} aria-label="Próxima">›</Link>
      </div>
    </div>
  )
}
