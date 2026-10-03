'use client'

import { SubmitButton } from '@/components/SubmitButton'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { criarTrocaSp } from './actions'

// Form simples de troca SP: peça + fornecedor + quantidade + valor. O status nasce
// 'enviado' e muda pelos botões da lista (voltou/abatido). Loja vem de um select —
// cada loja acompanha as PRÓPRIAS trocas (pedido do Vitor: separar por loja).
export function NovaTrocaSpForm({ lojas }: { lojas: { id: string; nome: string }[] }) {
  return (
    <form action={criarTrocaSp} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <h3 className="text-sm font-bold text-gray-800">🔄 Registrar troca enviada pro fornecedor</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Peça (item) *</label>
          <input name="item" required placeholder="Ex: Tela iPhone 11" className="field" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Fornecedor *</label>
          <input name="fornecedor" required placeholder="Ex: ADL, H2O, ZL" className="field" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Quantidade</label>
          <input name="quantidade" type="number" min="1" step="1" defaultValue={1} className="field text-center" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor (custo da peça) *</label>
          <CampoDinheiro name="valor" required />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Loja *</label>
          <select name="loja_id" required className="field">
            <option value="">Escolha a loja…</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Observação</label>
        <input name="observacao" placeholder="Opcional — defeito, nº da garantia…" className="field" />
      </div>
      <SubmitButton pendingText="Salvando…" className="rounded-lg bg-[#1B6CA8] px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition">
        Salvar troca
      </SubmitButton>
    </form>
  )
}
