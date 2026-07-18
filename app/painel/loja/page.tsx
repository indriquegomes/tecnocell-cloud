import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function LojaGestaoPage() {
  const supabase = await createClient()

  // Os contadores saem de count no banco, não de contar array na memória: o PostgREST
  // corta em 1000 linhas e, com 8 mil produtos, os cards mostravam 1000 como se fosse
  // o total. Contar no banco também evita trazer 8 mil linhas só pra exibir 4 números.
  const [
    { data: config },
    { count: totalProdutos },
    { count: totalVisiveis },
    { count: comImagem },
    { data: produtos },
  ] = await Promise.all([
    supabase.from('configuracoes').select('valor').eq('chave', 'empresa').single(),
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true).eq('visivel_catalogo', true),
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true).eq('visivel_catalogo', true).not('imagem_url', 'is', null),
    // a prévia mostra só os primeiros; não precisa de todos
    supabase
      .from('produtos')
      .select('id, nome, preco, visivel_catalogo, imagem_url, categoria')
      .eq('ativo', true)
      .eq('visivel_catalogo', true)
      .order('nome')
      .limit(60),
  ])

  const empresa = (config?.valor ?? {}) as Record<string, string>
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const lojaUrl = typeof window === 'undefined' ? '/loja' : `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/loja`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">SIGE Loja</h2>
        <a href="/loja" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Ver Loja
        </a>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Produtos Visíveis</p>
          <p className="text-2xl font-bold text-blue-600">{totalVisiveis ?? 0}</p>
          <p className="text-xs text-gray-400">{totalProdutos ?? 0} cadastrados</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Com Imagem</p>
          <p className="text-2xl font-bold text-gray-800">
            {comImagem ?? 0}
          </p>
          <p className="text-xs text-gray-400">de {totalVisiveis ?? 0} visíveis</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Sem Imagem</p>
          <p className="text-2xl font-bold text-yellow-600">
            {(totalVisiveis ?? 0) - (comImagem ?? 0)}
          </p>
          <p className="text-xs text-gray-400">precisam de imagem</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Telefone WhatsApp</p>
          <p className="text-sm font-bold text-gray-800 truncate">{empresa.telefone || '—'}</p>
          <p className="text-xs text-gray-400">configurado em Configurações</p>
        </div>
      </div>

      {/* Links rápidos */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800">Gerenciar Vitrine</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/painel/catalogo"
            className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-800 text-sm">Catálogo de Produtos</p>
              <p className="text-xs text-gray-400">Definir quais produtos aparecem na loja</p>
            </div>
          </Link>
          <Link href="/painel/configuracoes"
            className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
              <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-800 text-sm">Configurações da Empresa</p>
              <p className="text-xs text-gray-400">Nome, telefone, endereço (usados na loja)</p>
            </div>
          </Link>
          <Link href="/painel/promocoes"
            className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
              <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-800 text-sm">Promoções</p>
              <p className="text-xs text-gray-400">Configurar descontos e ofertas</p>
            </div>
          </Link>
          <a href="/loja" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
              <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-800 text-sm">Visualizar Loja</p>
              <p className="text-xs text-gray-400">Abre como o cliente vê</p>
            </div>
          </a>
        </div>
      </div>

      {/* Preview produtos visíveis */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Produtos na Vitrine ({totalVisiveis ?? 0})</h3>
          <Link href="/painel/catalogo" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Gerenciar →
          </Link>
        </div>
        {totalVisiveis === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
            <p className="text-sm text-gray-400">Nenhum produto visível na loja.</p>
            <Link href="/painel/catalogo" className="mt-2 inline-block text-xs font-medium text-blue-600 hover:text-blue-800">
              Ativar produtos no catálogo →
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(produtos ?? []).filter((p) => p.visivel_catalogo).slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
                {p.imagem_url ? (
                  <img src={p.imagem_url} alt={p.nome} className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-300">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{p.nome}</p>
                  <p className="text-xs font-bold text-blue-600">{fmt(p.preco ?? 0)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
