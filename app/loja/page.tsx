import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const revalidate = 60 // revalida a cada 60 segundos

export default async function LojaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>
}) {
  const { q, categoria } = await searchParams
  const supabase = await createClient()

  const [{ data: config }, { data: produtos }, { data: categoriasDb }] = await Promise.all([
    supabase.from('configuracoes').select('valor').eq('chave', 'empresa').single(),
    supabase
      .from('produtos')
      .select('id, nome, descricao, preco, categoria, marca, imagem_url, codigo')
      .eq('ativo', true)
      .eq('visivel_catalogo', true)
      .order('nome'),
    supabase.from('categorias').select('hierarquia, nome'),
  ])

  const empresa = (config?.valor ?? {}) as Record<string, string>
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // Map hierarquia code → display name
  const catNomeMap = Object.fromEntries((categoriasDb ?? []).map((c) => [c.hierarquia, c.nome]))

  const codesUsados = [...new Set((produtos ?? []).map((p) => p.categoria).filter(Boolean))] as string[]
  const categoriasUnicas = codesUsados.map((code) => ({ code, nome: catNomeMap[code] ?? code }))

  const produtosFiltrados = (produtos ?? []).filter((p) => {
    const matchQ = !q || p.nome.toLowerCase().includes(q.toLowerCase()) || (p.descricao ?? '').toLowerCase().includes(q.toLowerCase())
    const matchCat = !categoria || p.categoria === categoria
    return matchQ && matchCat
  })

  const telefone = empresa.telefone?.replace(/\D/g, '') ?? ''
  const whatsappBase = telefone ? `https://wa.me/55${telefone}` : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo-transparent.png" alt={empresa.nome_empresa ?? 'TecnoCell'} className="h-9 w-auto object-contain" />
            <div className="hidden sm:block">
              <p className="font-bold text-gray-900 text-sm">{empresa.nome_empresa ?? 'TecnoCell'}</p>
              {empresa.cidade && <p className="text-xs text-gray-400">{empresa.cidade}{empresa.estado ? `, ${empresa.estado}` : ''}</p>}
            </div>
          </div>
          <form method="GET" className="flex-1 max-w-md">
            {categoria && <input type="hidden" name="categoria" value={categoria} />}
            <div className="relative">
              <input
                name="q"
                defaultValue={q ?? ''}
                placeholder="Buscar produtos..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </form>
          {whatsappBase && (
            <a href={whatsappBase} target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 transition">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Filtros de categoria */}
        {categoriasUnicas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Link href={q ? `/loja?q=${q}` : '/loja'}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${!categoria ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
              Todos
            </Link>
            {categoriasUnicas.map(({ code, nome }) => (
              <Link key={code} href={q ? `/loja?q=${q}&categoria=${encodeURIComponent(code)}` : `/loja?categoria=${encodeURIComponent(code)}`}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${categoria === code ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                {nome}
              </Link>
            ))}
          </div>
        )}

        {/* Resultados */}
        {q || categoria ? (
          <p className="text-sm text-gray-500">
            {produtosFiltrados.length} resultado{produtosFiltrados.length !== 1 ? 's' : ''}{q ? ` para "${q}"` : ''}{categoria ? ` em ${catNomeMap[categoria] ?? categoria}` : ''}
          </p>
        ) : null}

        {/* Grid de produtos */}
        {produtosFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-20 text-center">
            <p className="text-gray-400">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {produtosFiltrados.map((p) => (
              <div key={p.id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition group">
                {p.imagem_url ? (
                  <img src={p.imagem_url} alt={p.nome} className="w-full h-48 object-cover group-hover:scale-105 transition" />
                ) : (
                  <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-300">
                    <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <p className="text-xs text-gray-400">{catNomeMap[p.categoria ?? ''] ?? p.categoria}{p.marca ? ` · ${p.marca}` : ''}</p>
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{p.nome}</p>
                  {p.descricao && <p className="text-xs text-gray-500 line-clamp-2">{p.descricao}</p>}
                  <p className="text-xl font-bold text-blue-600">{fmt(p.preco ?? 0)}</p>
                  {whatsappBase && (
                    <a
                      href={`${whatsappBase}?text=${encodeURIComponent(`Olá! Tenho interesse no produto: ${p.nome} (${fmt(p.preco ?? 0)})`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center rounded-xl bg-green-500 py-2 text-xs font-semibold text-white hover:bg-green-600 transition mt-2">
                      Pedir pelo WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-gray-400">
          {empresa.nome_empresa ?? 'TecnoCell'} · {empresa.endereco ?? ''}{empresa.cidade ? ` · ${empresa.cidade}` : ''}{empresa.estado ? `/${empresa.estado}` : ''} · {empresa.telefone ?? ''}
        </div>
      </footer>
    </div>
  )
}
