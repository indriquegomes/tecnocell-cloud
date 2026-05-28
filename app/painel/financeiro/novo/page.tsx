import { createServiceClient } from '@/lib/supabase/server'
import { criarLancamento } from '../actions'
import Link from 'next/link'

export default async function NovoLancamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()
  const { data: formas } = await supabase.from('formas_pagamento').select('id, nome').order('nome')
  const hoje = new Date().toISOString().split('T')[0]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/financeiro" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Novo LanÃ§amento</h2>
      </div>

      <form action={criarLancamento} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">DescriÃ§Ã£o *</label>
            <input name="descricao" required className="field" placeholder="Ex: Compra de mercadoria, Venda Ã  vista..." />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Tipo *</label>
            <select name="tipo" defaultValue={params.tipo ?? 'receber'} className="field">
              <option value="receber">A Receber</option>
              <option value="pagar">A Pagar</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor (R$) *</label>
            <input name="valor" type="number" step="0.01" min="0" required defaultValue="0" className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Data CompetÃªncia</label>
            <input name="data_competencia" type="date" defaultValue={hoje} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Data Vencimento *</label>
            <input name="data_vencimento" type="date" defaultValue={hoje} required className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Forma de Pagamento</label>
            <select name="forma_pagamento" className="field">
              <option value="">â€”</option>
              {(formas ?? []).map((f) => (
                <option key={f.id} value={f.nome}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cliente / Fornecedor</label>
            <input name="pessoa_nome" className="field" placeholder="Nome da pessoa" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Salvar LanÃ§amento
          </button>
          <Link href="/painel/financeiro" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}

