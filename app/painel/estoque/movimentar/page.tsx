import { createServiceClient } from '@/lib/supabase/server'
import { registrarMovimento } from '../actions'
import Link from 'next/link'

export default async function MovimentarEstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ produto_id?: string; deposito_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()
  const [{ data: produtos }, { data: depositos }] = await Promise.all([
    supabase.from('produtos').select('id, nome, codigo').eq('ativo', true).order('nome'),
    supabase.from('depositos').select('id, nome').order('nome'),
  ])

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/estoque" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Movimentar Estoque</h2>
      </div>

      <form action={registrarMovimento} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Produto *</label>
          <select name="produto_id" required className="field" defaultValue={params.produto_id ?? ''}>
            <option value="">Selecionar produto...</option>
            {(produtos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}{p.codigo ? ` (${p.codigo})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Depósito *</label>
          <select name="deposito_id" required className="field" defaultValue={params.deposito_id ?? ''}>
            <option value="">Selecionar depósito...</option>
            {(depositos ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.nome}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Operação *</label>
          <select name="operacao" required className="field">
            <option value="entrada">Entrada (adicionar ao estoque)</option>
            <option value="saida">Saída (retirar do estoque)</option>
            <option value="ajuste">Ajuste (definir quantidade exata)</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Quantidade *</label>
          <input name="quantidade" type="number" min="0" required defaultValue="1" className="field" />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Observação</label>
          <textarea
            name="observacao"
            rows={2}
            placeholder="Ex: compra nota fiscal 001, devolução cliente..."
            className="field resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Registrar
          </button>
          <Link href="/painel/estoque" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
