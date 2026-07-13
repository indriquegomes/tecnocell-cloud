import { createServiceClient } from '@/lib/supabase/server'
import { registrarMovimento } from '../actions'
import { BuscaProdutoMov } from './BuscaProdutoMov'
import Link from 'next/link'

export default async function MovimentarEstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ produto_id?: string; deposito_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()
  const { data: depositos } = await supabase.from('depositos').select('id, nome').order('nome')
  // se veio ?produto_id= (do botão "Ajustar" do Estoque), busca só o nome desse 1 produto
  const { data: produtoPre } = params.produto_id
    ? await supabase.from('produtos').select('id, nome').eq('id', params.produto_id).maybeSingle()
    : { data: null }

  const agoraBr = new Date().toLocaleString('sv', { timeZone: 'America/Sao_Paulo' })
  const dataHoje = agoraBr.slice(0, 10)
  const horaAgora = agoraBr.slice(11, 16)

  return (
    <div className="space-y-4">
      {/* Breadcrumb + botões */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/painel/estoque" className="hover:text-gray-700 transition">Estoque</Link>
          <span>›</span>
          <span className="text-gray-800 font-medium">Movimentações</span>
        </div>
        <div className="flex gap-2">
          <button form="form-mov" type="submit"
            className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 transition">
            Salvar
          </button>
          <Link href="/painel/estoque"
            className="rounded-lg bg-gray-800 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition">
            Voltar
          </Link>
        </div>
      </div>

      {/* Aba */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
          <span className="text-sm font-semibold text-blue-600">Nova Movimentação Estoque</span>
        </div>

        <form id="form-mov" action={registrarMovimento} className="p-6 space-y-5">

          {/* Linha 1: Depósito | Data | Horário */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Depósito *</label>
              <select name="deposito_id" required className="field" defaultValue={params.deposito_id ?? ''}>
                <option value="">*</option>
                {(depositos ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Data Movimentação *</label>
              <input name="data_mov" type="date" required defaultValue={dataHoje} className="field" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Horário *</label>
              <input name="horario_mov" type="time" required defaultValue={horaAgora} className="field" />
            </div>
          </div>

          {/* Linha 2: Nota Fiscal | Operação */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Nota Fiscal</label>
              <input name="nota_fiscal" type="text" placeholder="Ex: 001234" className="field" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Operação *</label>
              <select name="operacao" required className="field">
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
                <option value="ajuste">Ajuste</option>
                <option value="perda">Perda</option>
              </select>
            </div>
          </div>

          {/* Linha 3: Produto + Quantidade */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome do Produto *</label>
              <BuscaProdutoMov initialNome={produtoPre?.nome ?? ''} initialId={produtoPre?.id ?? ''} />
            </div>
            <div className="w-36">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Quantidade *</label>
              <input name="quantidade" type="number" min="0" step="any" required defaultValue="1" className="field" />
            </div>
          </div>

          {/* Anotações */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Anotações</label>
            <textarea
              name="observacao"
              rows={4}
              placeholder=""
              className="field resize-none"
            />
          </div>

        </form>
      </div>
    </div>
  )
}
