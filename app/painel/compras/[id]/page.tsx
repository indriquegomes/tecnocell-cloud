import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { receberNota, estornarNota, editarNota, removerItemNota } from '../actions'
import { ConfirmButton } from '@/components/ConfirmButton'
import { SubmitButton } from '@/components/SubmitButton'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { AddItemNota } from './AddItemNota'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function NotaEntradaDetalhe({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { id } = await params
  const { erro } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: nota }, { data: itens }, produtos, { data: depositos }, { data: fornecedores }, { data: lojas }] = await Promise.all([
    supabase
      .from('notas_entrada')
      .select('*, pessoas(nome)')
      .eq('id', id)
      .single(),
    supabase
      .from('itens_nota_entrada')
      .select('*')
      .eq('nota_id', id)
      .order('id'),
    fetchAll((from, to) => supabase.from('produtos').select('id, nome, codigo, marca, preco_custo').eq('ativo', true).order('nome').order('id').range(from, to)),
    supabase.from('depositos').select('id, nome, loja_id').order('nome'),
    supabase.from('pessoas').select('id, nome, tipo').in('tipo', ['fornecedor', 'ambos']).eq('ativo', true).order('nome'),
    supabase.from('lojas').select('id, nome'),
  ])

  if (!nota) notFound()

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const fornecedor = nota.pessoas as { nome: string } | null
  const lojaNome = new Map((lojas ?? []).map((l) => [l.id, l.nome]))
  const depMap = new Map((depositos ?? []).map((d) => [d.id, { nome: d.nome, loja: d.loja_id ? (lojaNome.get(d.loja_id) ?? null) : null }]))
  const prodNome = new Map((produtos ?? []).map((p) => [p.id, p.nome]))
  const pendente = nota.status === 'pendente'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/compras" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">
              Nota {nota.numero ? `#${nota.numero}` : id.slice(0, 8).toUpperCase()}
            </h2>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${nota.status === 'recebida' ? 'bg-green-100 text-green-700' : nota.status === 'cancelada' ? 'bg-red-100 text-red-500' : 'bg-yellow-100 text-yellow-700'}`}>
              {nota.status}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            Fornecedor: {fornecedor?.nome ?? 'Sem fornecedor'} · Entrada: {fmtDate(nota.data_entrada)}
          </p>
        </div>
        {nota.status === 'pendente' && (
          <form action={receberNota.bind(null, id)}>
            <ConfirmButton message="Confirmar recebimento? O estoque será atualizado."
              className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 transition">
              Confirmar Recebimento
            </ConfirmButton>
          </form>
        )}
        {nota.status === 'recebida' && (
          <form action={estornarNota.bind(null, id)}>
            <ConfirmButton message="Estornar esta nota? O estoque que entrou será devolvido."
              className="rounded-xl border border-red-200 px-5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition">
              Estornar
            </ConfirmButton>
          </form>
        )}
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {/* Editar dados da nota (só enquanto pendente) */}
      {pendente && (
        <details className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <summary className="cursor-pointer px-6 py-4 text-sm font-semibold text-gray-700">Dados da nota (número, fornecedor, datas)</summary>
          <form action={editarNota.bind(null, id)} className="grid gap-4 sm:grid-cols-2 px-6 pb-6">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Número da NF</label>
              <input name="numero" defaultValue={nota.numero ?? ''} className="field" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Fornecedor</label>
              <select name="fornecedor_id" defaultValue={nota.fornecedor_id ?? ''} className="field">
                <option value="">— Selecione —</option>
                {(fornecedores ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Data de Entrada</label>
              <input name="data_entrada" type="date" defaultValue={nota.data_entrada ?? ''} className="field" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Data de Emissão</label>
              <input name="data_emissao" type="date" defaultValue={nota.data_emissao ?? ''} className="field" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
              <textarea name="observacoes" rows={2} defaultValue={nota.observacoes ?? ''} className="field" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton pendingText="Salvando…" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">Salvar dados</SubmitButton>
            </div>
          </form>
        </details>
      )}

      {/* Adicionar item — com busca de produto + loja/estoque */}
      {pendente && (
        <AddItemNota notaId={id} produtos={produtos ?? []} depositos={depositos ?? []} lojas={lojas ?? []} />
      )}

      {/* Itens */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Loja / Depósito</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qtd</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Unit.</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
              {pendente && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(itens ?? []).length === 0 ? (
              <tr><td colSpan={pendente ? 6 : 5} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum item adicionado.</td></tr>
            ) : (itens ?? []).map((item) => {
              const dep = depMap.get(item.deposito_id)
              return (
                <tr key={item.id} className="hover:bg-blue-50/60">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{prodNome.get(item.produto_id) ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{dep ? `${dep.loja ? dep.loja + ' · ' : ''}${dep.nome}` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{item.quantidade}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{fmt(item.preco_unitario ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(item.total_item ?? 0)}</td>
                  {pendente && (
                    <td className="px-4 py-3 text-center">
                      <BotaoExcluir action={removerItemNota.bind(null, item.id, id)} mensagem="Remover este item da nota?" />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          {(itens ?? []).length > 0 && (
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">Total da Nota</td>
                <td className="px-4 py-3 text-base font-bold text-gray-900 text-right">{fmt(nota.valor_total ?? 0)}</td>
                {pendente && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {nota.observacoes && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Observações</p>
          <p className="text-sm text-gray-700">{nota.observacoes}</p>
        </div>
      )}
    </div>
  )
}
