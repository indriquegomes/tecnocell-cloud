import { createServiceClient } from '@/lib/supabase/server'
import { IconPlus, IconUsers } from '@/components/icons'
import { BuscaPessoas } from './BuscaPessoas'
import { Paginacao } from '@/components/Paginacao'
import { Badge } from '@/components/ui/badge'
import { deletarPessoa, inativarPessoa, reativarPessoa } from './actions'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { badgeTabela } from '@/lib/badge-tabela'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; tipo?: string; ordem?: string; dir?: string; status?: string; foto?: string; pagina?: string; erro?: string; de?: string; ate?: string; cidade?: string; tabela?: string; pf?: string }>
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
  if (params.foto === 'com' || params.foto === 'sem') baseParams.foto = params.foto
  if (params.de)    baseParams.de = params.de
  if (params.ate)   baseParams.ate = params.ate
  if (params.cidade) baseParams.cidade = params.cidade
  if (params.tabela) baseParams.tabela = params.tabela
  if (params.pf)     baseParams.pf = params.pf

  // link do filtro de foto preservando busca/tipo/status
  const fotoLink = (val: '' | 'com' | 'sem') => {
    const qs = new URLSearchParams()
    if (params.busca) qs.set('busca', params.busca)
    if (params.tipo) qs.set('tipo', params.tipo)
    if (verInativos) qs.set('status', 'inativos')
    if (params.de) qs.set('de', params.de)
    if (params.ate) qs.set('ate', params.ate)
    if (params.cidade) qs.set('cidade', params.cidade)
    if (params.tabela) qs.set('tabela', params.tabela)
    if (params.pf) qs.set('pf', params.pf)
    if (val) qs.set('foto', val)
    const s = qs.toString()
    return `/painel/clientes${s ? '?' + s : ''}`
  }

  const sortLink = (ordem: string) => {
    const ativo = ordemAtual === ordem
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'asc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParams, ordem, ...(nextDir === 'desc' ? { dir: 'desc' } : {}) }).toString()
    return { href: `/painel/clientes?${qs}`, arrow, ativo }
  }

  const porPagina = 50
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10) || 1)

  // nomes das tabelas de preço — pra pintar o badge (🟢 Atacado 1 / 🟠 Atacado 2)
  const { data: tabelas } = await supabase.from('tabelas_preco').select('id, nome')
  // Cidades cadastradas (dropdown do filtro "mais detalhes" da Isa)
  const { data: cidadesRaw } = await supabase.from('pessoas').select('cidade').not('cidade', 'is', null).limit(3000)
  const cidadesOpc = [...new Set((cidadesRaw ?? []).map((c) => (c.cidade as string)?.trim()).filter(Boolean))].sort()

  let query = supabase
    .from('pessoas')
    .select('id, nome, tipo, pessoa_fisica, cpf_cnpj, email, telefone, cidade, estado, ativo, tabela_preco_id, nao_vender, nao_vender_motivo, foto_url', { count: 'exact' })
    .eq('ativo', !verInativos)
    .order(ordemCampo, { ascending: !ordemDir })

  // filtro de comprovação: quem tem foto × quem falta
  if (params.foto === 'com') query = query.not('foto_url', 'is', null)
  else if (params.foto === 'sem') query = query.is('foto_url', null)

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
  // Período de cadastro (Isa 29/07): filtrar clientes cadastrados dentro do período
  if (params.de)  query = query.gte('created_at', params.de + 'T00:00:00')
  if (params.ate) query = query.lte('created_at', params.ate + 'T23:59:59')
  // Filtros "mais detalhes" (Isa): cidade, tabela de preço, física/jurídica
  if (params.cidade) query = query.eq('cidade', params.cidade)
  if (params.tabela) query = query.eq('tabela_preco_id', params.tabela)
  if (params.pf === 'fisica')   query = query.eq('pessoa_fisica', true)
  else if (params.pf === 'juridica') query = query.eq('pessoa_fisica', false)

  query = query.range((pagina - 1) * porPagina, pagina * porPagina - 1)
  const { data: pessoas, count } = await query
  const total = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconUsers className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Clientes e Fornecedores</h2>
          <Dica texto="Cadastro de pessoas físicas e jurídicas: clientes, fornecedores ou ambos. Usado no PDV, pedidos e financeiro." />
        </div>
        <Link href="/painel/clientes/novo"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          <IconPlus className="h-4 w-4" /> Novo Cadastro
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
        {/* Comprovação: quem tem foto × quem falta */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <Link href={fotoLink('')}
            className={`px-3 py-2 transition ${!params.foto ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Foto: todos</Link>
          <Link href={fotoLink('com')}
            className={`px-3 py-2 border-l border-gray-200 transition ${params.foto === 'com' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>📷 Com foto</Link>
          <Link href={fotoLink('sem')}
            className={`px-3 py-2 border-l border-gray-200 transition ${params.foto === 'sem' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Sem foto</Link>
        </div>
        {/* Filtros detalhados (Isa 29/07): cidade, tabela, física/jurídica, período */}
        <form method="GET" className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
          {params.busca && <input type="hidden" name="busca" value={params.busca} />}
          {params.tipo && <input type="hidden" name="tipo" value={params.tipo} />}
          {verInativos && <input type="hidden" name="status" value="inativos" />}
          {(params.foto === 'com' || params.foto === 'sem') && <input type="hidden" name="foto" value={params.foto} />}
          <select name="cidade" defaultValue={params.cidade ?? ''}
            className="rounded border border-gray-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">🏙️ Cidade: todas</option>
            {cidadesOpc.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select name="tabela" defaultValue={params.tabela ?? ''}
            className="rounded border border-gray-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">🏷️ Tabela: todas</option>
            {(tabelas ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select name="pf" defaultValue={params.pf ?? ''}
            className="rounded border border-gray-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">👤 Física/Jurídica</option>
            <option value="fisica">Pessoa Física</option>
            <option value="juridica">Pessoa Jurídica</option>
          </select>
          <span className="text-xs font-semibold uppercase text-gray-400">Cadastro</span>
          <input type="date" name="de" defaultValue={params.de ?? ''}
            className="rounded border border-gray-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <span className="text-gray-300">—</span>
          <input type="date" name="ate" defaultValue={params.ate ?? ''}
            className="rounded border border-gray-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700 transition">Filtrar</button>
          {(params.de || params.ate || params.cidade || params.tabela || params.pf) && <Link href="/painel/clientes" className="text-gray-400 hover:text-gray-600">Limpar</Link>}
        </form>
        <span className="ml-auto self-center text-sm text-gray-400">{total} registro{total === 1 ? '' : 's'}</span>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
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
                <tr key={p.id} className="hover:bg-blue-50/60 transition">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-800">{p.nome}</p>
                      {/* Badge da tabela embaixo do nome, sem coluna nova:
                          🟢 ATACADO1 (preço melhor) · 🟠 ATACADO2 (mais caro) */}
                      {(() => {
                        const b = badgeTabela(p.tabela_preco_id as string | null, tabelas ?? [])
                        return b ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${b.cls}`}>{b.txt}</span> : null
                      })()}
                      {p.nao_vender && (
                        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700"
                          title={(p.nao_vender_motivo as string) || 'Cliente marcado como não vender'}>
                          🚫 NÃO VENDER
                        </span>
                      )}
                      {p.foto_url && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700" title="Tem foto de comprovação">📷</span>
                      )}
                    </div>
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
        <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} params={baseParams} basePath="/painel/clientes" />
      </div>
    </div>
  )
}
