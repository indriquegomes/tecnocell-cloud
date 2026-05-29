import { createServiceClient } from '@/lib/supabase/server'
import { criarPedido } from '../actions'
import Link from 'next/link'

export default async function NovoPedidoPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()
  const { data: pessoas } = await supabase.from('pessoas').select('id, nome, tipo').order('nome').limit(500)
  const clientes = (pessoas ?? []).filter((p) => p.tipo === 'cliente' || p.tipo === 'ambos')

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/pedidos" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Novo Pedido / Orçamento</h2>
      </div>
      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
      <form action={criarPedido} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Tipo *</label>
          <select name="tipo" className="field">
            <option value="orcamento">Orçamento</option>
            <option value="pedido">Pedido</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Cliente</label>
          <select name="pessoa_id" className="field">
            <option value="">— Selecione —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Validade</label>
          <input name="data_validade" type="date" className="field" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
          <textarea name="observacoes" rows={3} className="field" placeholder="Opcional..." />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Criar
          </button>
          <Link href="/painel/pedidos" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
