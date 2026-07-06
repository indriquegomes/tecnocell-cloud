import { createServiceClient } from '@/lib/supabase/server'
import { BuscaPessoas } from './BuscaPessoas'
import { Badge } from '@/components/ui/badge'
import { deletarPessoa, inativarPessoa, reativarPessoa } from './actions'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; tipo?: string; ordem?: string; dir?: string; status?: string; erro?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const verInativos = params.status === 'inativos'
  const ordemAtual = params.ordem ?? 'nome'
  const ordemDir = params.dir === 'desc'
  const camposDB: Record<string, string> = { nome: 'nome', cidade: 'cidade', tipo: 'tipo' }
  const ordemCampo = camposDB[ordemAtual] ?? 'nome'

  const baseParams: Record<string, string> = {}
  if (params.busca) baseParams.busca = params.busca
  if (params.tipo)  baseParams.tipo  = params.tipo
  if (verInativos)  baseParams.status = 'inativos'

  const sortLink = (ordem: string) => {
    const ativo = ordemAtual === ordem
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'asc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParams, ordem, ...(nextDir === 'desc' ? { dir: 'desc' } : {}) }).toString()
    return { href: `/painel/clientes?${qs}`, arrow, ativo }
  }

  let query = supabase
    .from('pessoas')
    .select('id, nome, tipo, pessoa_fisica, cpf_cnpj, email, telefone, cidade, estado, ativo')
    .eq('ativo', !verInativos)
    .order(ordemCampo, { ascending: !ordemDir })
    .limit(500)

  if (params.busca) {
    const raw = params.busca.trim()
    const digitos = params.busca.replace(/\D/g, '')
    const soDigitos = digitos.length >= 4 && /^[\d.\-/()\s]+$/.test(raw)
    if (soDigitos) {
      // busca numérica → CPF/CNPJ ou telefone
      query = query.or(`cpf_cnpj.ilike.%${digitos}%,telefone.ilike.%${digitos}%,celular.ilike.%${digitos}%`)
    } else {
      // busca textual sem acento → cada palavra tem que aparecer no nome (qualquer ordem)
      const semAcento = raw.normalize('NFD').split('').filter(c => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
      const palavras = semAcento.replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
      for (const w of palavras) query = query.ilike('nome_norm', `%${w}%`)
    }
  }
  if (params.tipo) query = query.eq('tipo', params.tipo)

  const { data: pessoas } = await query

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">Clientes e Fornecedores</h2>
          <Dica texto="Cadastro de pessoas físicas e jurídicas: clientes, fornecedores ou ambos. Usado no PDV, pedidos e financeiro." />
        </div>
        <Link href="/painel/clientes/novo"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          + Novo Cadastro
        </Link>
      </div>

      {params.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{params.erro}</div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <BuscaPessoas />
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <Link href={verInativos ? '/painel/clientes?status=inativos' : '/painel/clientes'}
            className={`px-4 py-2 transition ${!params.tipo ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Todos
          </Link>
          <Link href={`/painel/clientes?tipo=cliente${verInativos ? '&status=inativos' : ''}`}
            className={`px-4 py-2 border-l border-gray-200 transition ${params.tipo === 'cliente' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Clientes
          </Link>
          <Link href={`/painel/clientes?tipo=fornecedor${verInativos ? '&status=inativos' : ''}`}
            className={`px-4 py-2 border-l border-gray-200 transition ${params.tipo === 'fornecedor' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Fornecedores
          </Link>
        </div>
        <Link href={verInativos ? `/painel/clientes${params.tipo ? `?tipo=${params.tipo}` : ''}` : `/painel/clientes?status=inativos${params.tipo ? `&tipo=${params.tipo}` : ''}`}
          className={`rounded-lg border px-4 py-2 text-sm transition ${verInativos ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          {verInativos ? '← Voltar aos ativos' : 'Ver inativos'}
        </Link>
        <span className="ml-auto self-center text-sm text-gray-400">{pessoas?.length ?? 0} registros</span>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[{ o: 'nome', l: 'Nome', a: 'text-left' }, { o: 'cidade', l: 'Cidade', a: 'text-left' }, { o: 'tipo', l: 'Tipo', a: 'text-center' }].map(({ o, l, a }) => {
                const s = sortLink(o)
                return <th key={o} className={`px-4 py-3 ${a} text-xs font-semibold text-gray-500 uppercase tracking-wide`}>
                  <Link href={s.href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${s.ativo ? 'text-blue-600' : ''}`}>{l} <span className="text-gray-400">{s.arrow}</span></Link>
                </th>
              })}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">CPF/CNPJ</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contato</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(pessoas ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum registro encontrado. <Link href="/painel/clientes/novo" className="text-blue-500 hover:underline">Cadastrar</Link>.
                </td>
              </tr>
            ) : (
              (pessoas ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-800">{p.nome}</p>
                    <p className="text-xs text-gray-400">{p.pessoa_fisica ? 'Pessoa Física' : 'Pessoa Jurídica'}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {p.cidade ? `${p.cidade}${p.estado ? `/${p.estado}` : ''}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={p.tipo === 'cliente' ? 'default' : p.tipo === 'fornecedor' ? 'warning' : 'outline'}>
                      {p.tipo === 'ambos' ? 'Cliente/Fornec.' : p.tipo}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.cpf_cnpj || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {p.email && <p>{p.email}</p>}
                    {p.telefone && <p>{p.telefone}</p>}
                    {!p.email && !p.telefone && '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Link
                        href={`/painel/clientes/${p.id}/editar`}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition"
                      >
                        Editar
                      </Link>
                      {verInativos ? (
                        <form action={reativarPessoa.bind(null, p.id)}>
                          <button type="submit" className="rounded-lg px-2.5 py-1 text-xs font-medium text-green-600 hover:bg-green-50 transition">
                            Reativar
                          </button>
                        </form>
                      ) : (
                        <>
                          <form action={inativarPessoa.bind(null, p.id)}>
                            <button type="submit" className="rounded-lg px-2.5 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 transition">
                              Inativar
                            </button>
                          </form>
                          <BotaoExcluir action={deletarPessoa.bind(null, p.id)} mensagem="Excluir este cadastro? (só funciona se não tiver histórico)" />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
