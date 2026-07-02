import { createServiceClient } from '@/lib/supabase/server'
import { editarPessoa } from '../../actions'
import { formatBRL, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const ESTADOS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const TIPOS = [
  ['cliente', 'Cliente'], ['fornecedor', 'Fornecedor'], ['ambos', 'Cliente e Fornecedor'],
  ['tecnico', 'Técnico'], ['transportadora', 'Transportadora'], ['vendedor', 'Vendedor'],
]

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

  const [{ data: pessoa }, { data: tabelas }, { data: vendas }, { data: creds }] = await Promise.all([
    supabase.from('pessoas').select('*').eq('id', id).single(),
    supabase.from('tabelas_preco').select('id, nome').eq('ativa', true).order('nome'),
    supabase.from('vendas').select('id, numero, total, created_at, status').eq('pessoa_id', id).order('created_at', { ascending: false }).limit(20),
    supabase.from('creditos_clientes').select('tipo, valor').eq('pessoa_id', id),
  ])
  if (!pessoa) notFound()

  const vendaIds = (vendas ?? []).map((v) => v.id)
  const { data: lancs } = vendaIds.length
    ? await supabase.from('lancamentos').select('valor, valor_pago').in('venda_id', vendaIds).eq('tipo', 'receber').eq('status', 'pendente')
    : { data: [] as { valor: number | null; valor_pago: number | null }[] }

  const fiadoPendente = (lancs ?? []).reduce((s, l) => s + ((l.valor ?? 0) - (l.valor_pago ?? 0)), 0)
  const saldoCredito = (creds ?? []).reduce((s, c) => (c.tipo === 'uso' ? s - (c.valor ?? 0) : s + (c.valor ?? 0)), 0)
  const totalComprado = (vendas ?? []).reduce((s, v) => s + (v.total ?? 0), 0)
  const limite = Number(pessoa.limite_credito ?? 0)

  const action = editarPessoa.bind(null, id)

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
          <p className="text-xs text-gray-500">Total já comprado</p>
          <p className="text-xl font-bold text-gray-900">{formatBRL(totalComprado)}</p>
          <p className="text-[11px] text-gray-400">{(vendas ?? []).length} compra(s)</p>
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
      <form action={action} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome / Razão Social *</label>
            <input name="nome" required defaultValue={pessoa.nome} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Rótulo (tipo) *</label>
            <select name="tipo" defaultValue={pessoa.tipo} className="field">
              {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Pessoa</label>
            <select name="pessoa_fisica" defaultValue={String(pessoa.pessoa_fisica)} className="field">
              <option value="true">Física</option>
              <option value="false">Jurídica</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">CPF / CNPJ</label>
            <input name="cpf_cnpj" defaultValue={pessoa.cpf_cnpj ?? ''} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Telefone</label>
            <input name="telefone" defaultValue={pessoa.telefone ?? ''} className="field" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">E-mail</label>
            <input name="email" type="email" defaultValue={pessoa.email ?? ''} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cidade</label>
            <input name="cidade" defaultValue={pessoa.cidade ?? ''} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Estado</label>
            <select name="estado" defaultValue={pessoa.estado ?? ''} className="field">
              <option value="">—</option>
              {ESTADOS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Tabela de preço padrão</label>
            <select name="tabela_preco_id" defaultValue={pessoa.tabela_preco_id ?? ''} className="field">
              <option value="">Preço Padrão</option>
              {(tabelas ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">Aplicada automaticamente no PDV ao escolher este cliente</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Limite de crédito (fiado) R$</label>
            <input name="limite_credito" type="number" step="0.01" min="0" defaultValue={String(limite)} className="field" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Salvar Alterações
          </button>
          <Link href="/painel/clientes" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        </div>
      </form>

      {/* Histórico de compras */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">Histórico de compras</h3>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Venda</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(vendas ?? []).length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma compra ainda.</td></tr>
              ) : (vendas ?? []).map((v) => (
                <tr key={v.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(v.created_at)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{v.numero ? `#${v.numero}` : '—'}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">{v.status}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatBRL(v.total ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
