import { createServiceClient } from '@/lib/supabase/server'
import { criarLancamento } from '../actions'
import { SubmitButton } from '@/components/SubmitButton'
import Link from 'next/link'

export default async function NovoLancamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()
  const { data: formasRaw } = await supabase.from('formas_pagamento').select('id, nome').eq('ativo', true)
  const { data: contas } = await supabase.from('contas').select('id, nome, tipo').eq('ativa', true).order('nome')
  const ORDEM_FORMAS = ['PIX', 'Dinheiro', 'Crédito Loja (Fiado)', 'Cartão de Débito', 'Cartão de Crédito']
  const formas = (formasRaw ?? []).slice().sort((a, b) => {
    const ia = ORDEM_FORMAS.indexOf(a.nome)
    const ib = ORDEM_FORMAS.indexOf(b.nome)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.nome.localeCompare(b.nome)
  })
  const hoje = new Date().toISOString().split('T')[0]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/financeiro" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Novo Lançamento</h2>
      </div>

      <form action={criarLancamento} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Descrição *</label>
            <input name="descricao" required className="field" placeholder="Ex: Compra de mercadoria, Venda à vista..." />
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
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Data Competência</label>
            <input name="data_competencia" type="date" defaultValue={hoje} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Data Vencimento *</label>
            <input name="data_vencimento" type="date" defaultValue={hoje} required className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Forma de Pagamento</label>
            <select name="forma_pagamento" className="field">
              <option value="">—</option>
              {(formas ?? []).map((f) => (
                <option key={f.id} value={f.nome}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cliente / Fornecedor</label>
            <input name="pessoa_nome" className="field" placeholder="Nome da pessoa" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Categoria</label>
            <input name="categoria" list="categorias-list" className="field" placeholder="Ex: Aluguel, Fornecedor..." />
            <datalist id="categorias-list">
              <option value="Vendas" /><option value="Serviços (OS)" /><option value="Aluguel" />
              <option value="Fornecedor / Mercadoria" /><option value="Salários" /><option value="Impostos" />
              <option value="Energia / Água / Internet" /><option value="Marketing" /><option value="Manutenção" />
              <option value="Outras receitas" /><option value="Outras despesas" />
            </datalist>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Conta (entra/sai daqui)</label>
            <select name="conta_id" className="field">
              <option value="">—</option>
              {(contas ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.tipo === 'caixa' ? '💵' : '🏦'} {c.nome}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium text-gray-700">
            <input type="checkbox" name="quitado" value="1" className="h-4 w-4 rounded" />
            Já está pago/recebido?
          </label>
        </div>
        <p className="text-[11px] text-gray-400">Marque a Conta + &quot;já pago&quot; pra o valor entrar no saldo da conta na hora. Fiado/a pagar futuro deixa desmarcado.</p>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="mb-2 text-sm font-semibold text-gray-700">Repetição</p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="repeticao" value="nao" defaultChecked className="h-4 w-4" /> Não repetir</label>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="repeticao" value="parcelar" className="h-4 w-4" /> Parcelar (divide o valor)</label>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="repeticao" value="mensal" className="h-4 w-4" /> Repetir todo mês (mesmo valor)</label>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Quantas vezes:</label>
              <input name="repeticoes" type="number" min="1" max="60" defaultValue="1" className="field w-20" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">Ex: aluguel = &quot;todo mês&quot; 12×. Compra parcelada = &quot;parcelar&quot; 3×. Cada parcela vence no mês seguinte.</p>
        </div>

        <div className="flex gap-3 pt-2">
          <SubmitButton pendingText="Salvando..." className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
            Salvar Lançamento
          </SubmitButton>
          <Link href="/painel/financeiro" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
