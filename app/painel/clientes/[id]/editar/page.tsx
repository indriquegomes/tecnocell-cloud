import { createServiceClient, permissoesUsuarioAtual } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'
import { hojeSP } from '@/lib/utils'
import { PessoaForm, type PessoaEdit } from '../../PessoaForm'
import { formatBRL, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function EditarClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { id } = await params
  const { erro } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: pessoa }, { data: tabelas }, { data: vendedores }, { data: vendas }, { data: creds }, { data: oss }] = await Promise.all([
    supabase.from('pessoas').select('*').eq('id', id).single(),
    supabase.from('tabelas_preco').select('id, nome').eq('ativa', true).order('nome'),
    supabase.from('perfis').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('vendas').select('id, numero, total, created_at, status').eq('pessoa_id', id).order('created_at', { ascending: false }).limit(20),
    supabase.from('creditos_clientes').select('tipo, valor').eq('pessoa_id', id),
    supabase.from('ordens_servico').select('id, numero, aparelho, modelo, status, total, created_at').eq('pessoa_id', id).order('created_at', { ascending: false }).limit(20),
  ])
  if (!pessoa) notFound()

  const vendaIds = (vendas ?? []).map((v) => v.id)
  const { data: lancs } = vendaIds.length
    ? await supabase.from('lancamentos').select('valor, valor_pago').in('venda_id', vendaIds).eq('tipo', 'receber').eq('status', 'pendente')
    : { data: [] as { valor: number | null; valor_pago: number | null }[] }

  // Histórico de compras importado do SIGE (casado pelo nome do cliente)
  const mesAtras = hojeSP(-30)
  const [{ data: histSige }, { data: histMes }] = await Promise.all([
    supabase.from('historico_vendas').select('codigo, data, loja, valor_final, vendedor').ilike('cliente', pessoa.nome).order('data', { ascending: false }).limit(60),
    supabase.from('historico_vendas').select('valor_final').ilike('cliente', pessoa.nome).gte('data', mesAtras).limit(1000),
  ])
  const qtdMes = (histMes ?? []).length
  const totalMes = (histMes ?? []).reduce((s, v) => s + (v.valor_final ?? 0), 0)
  const comprasSige = (histSige ?? []).map((v) => ({
    key: 'sige-' + v.codigo, data: v.data ?? '', ref: v.codigo ? `#${v.codigo}` : '—',
    info: [v.loja, v.vendedor].filter(Boolean).join(' · '), total: v.valor_final ?? 0,
  }))
  const comprasApp = (vendas ?? []).map((v) => ({
    key: 'app-' + v.id, data: v.created_at, ref: v.numero ? `#${v.numero}` : '—', info: v.status ?? '', total: v.total ?? 0,
  }))
  const compras = [...comprasApp, ...comprasSige].sort((a, b) => (b.data || '').localeCompare(a.data || ''))

  const fiadoPendente = (lancs ?? []).reduce((s, l) => s + ((l.valor ?? 0) - (l.valor_pago ?? 0)), 0)
  // 'uso' e 'estorno' subtraem; 'credito' soma. O estorno CANCELA um crédito
  // (fix de sinal, igual ao RPC e ao buscarSaldoCredito) — antes ele somava.
  const saldoCredito = (creds ?? []).reduce((s, c) => ((c.tipo === 'uso' || c.tipo === 'estorno') ? s - (c.valor ?? 0) : s + (c.valor ?? 0)), 0)
  const totalComprado = (vendas ?? []).reduce((s, v) => s + (v.total ?? 0), 0)
  const limite = Number(pessoa.limite_credito ?? 0)
  const { permissoes, isMaster } = await permissoesUsuarioAtual()
  const podeCredito = temPermissao(permissoes, 'credito_limite', isMaster)

  // foto fica no bucket PRIVADO — gera URL assinada (1h) só pra exibir aqui
  let fotoAtualUrl: string | null = null
  if (pessoa.foto_url) {
    const { data: signed } = await supabase.storage.from('clientes').createSignedUrl(pessoa.foto_url as string, 3600)
    fotoAtualUrl = signed?.signedUrl ?? null
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/clientes" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">{pessoa.nome}</h2>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Comprou (últ. mês)</p>
          <p className="text-xl font-bold text-gray-900">{formatBRL(totalMes)}</p>
          <p className="text-[11px] text-gray-400">{qtdMes} compra(s){totalComprado > 0 ? ` · ${formatBRL(totalComprado)} no app` : ''}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Fiado em aberto</p>
          <p className={`text-xl font-bold ${fiadoPendente > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{formatBRL(fiadoPendente)}</p>
          {limite > 0 && <p className="text-[11px] text-gray-400">Limite {formatBRL(limite)}{fiadoPendente > limite ? ' · ⚠️ acima' : ''}</p>}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Crédito disponível</p>
          <p className={`text-xl font-bold ${saldoCredito > 0 ? 'text-green-600' : 'text-gray-900'}`}>{formatBRL(saldoCredito)}</p>
        </div>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {/* Cadastro */}
      <PessoaForm tabelas={tabelas ?? []} vendedores={vendedores ?? []} editando={pessoa as PessoaEdit} podeCredito={podeCredito} fotoAtualUrl={fotoAtualUrl} />

      {/* Histórico de compras (app + importado do SIGE) */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Histórico de compras
          {comprasSige.length > 0 && <span className="ml-2 normal-case font-normal text-gray-400">· últimas {compras.length} (SIGE importado)</span>}
        </h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Venda</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Loja / Vendedor</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {compras.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma compra ainda.</td></tr>
              ) : compras.map((c) => (
                <tr key={c.key} className="hover:bg-blue-50/60 transition">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(c.data)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.ref}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.info || '—'}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatBRL(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Histórico de OS (aparelhos que passaram pela assistência) */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">Ordens de serviço</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">OS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Aparelho</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(oss ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma ordem de serviço.</td></tr>
              ) : (oss ?? []).map((o) => (
                <tr key={o.id} className="hover:bg-blue-50/60 transition">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(o.created_at)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{o.numero ? `#${o.numero}` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{[o.aparelho, o.modelo].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">{o.status}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatBRL(o.total ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
