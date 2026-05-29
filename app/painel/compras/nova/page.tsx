import { createServiceClient } from '@/lib/supabase/server'
import { criarNotaEntrada } from '../actions'
import Link from 'next/link'

export default async function NovaNotaPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()
  const { data: pessoas } = await supabase.from('pessoas').select('id, nome, tipo').order('nome').limit(500)
  const fornecedores = (pessoas ?? []).filter((p) => p.tipo === 'fornecedor' || p.tipo === 'ambos')

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/compras" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Nova Nota de Entrada</h2>
      </div>
      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
      <form action={criarNotaEntrada} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Número da NF</label>
            <input name="numero" className="field" placeholder="Ex: 001234" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Data de Entrada</label>
            <input name="data_entrada" type="date" className="field"
              defaultValue={new Date().toISOString().split('T')[0]} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Data de Emissão</label>
            <input name="data_emissao" type="date" className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Fornecedor</label>
            <select name="fornecedor_id" className="field">
              <option value="">� Selecione �</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
            <textarea name="observacoes" rows={2} className="field" placeholder="Opcional..." />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Criar Nota
          </button>
          <Link href="/painel/compras" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}

