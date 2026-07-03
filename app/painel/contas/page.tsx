import { createServiceClient } from '@/lib/supabase/server'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { criarConta, editarConta, deletarConta, criarTransferencia, deletarTransferencia } from './actions'
import { Dica } from '@/components/Dica'
import { formatBRL, formatDate } from '@/lib/utils'
import Link from 'next/link'

type Conta = { id: string; nome: string; tipo: string; ativa: boolean }
type Transf = { id: string; conta_origem_id: string; conta_destino_id: string; valor: number; data: string; observacao: string | null }

// Leitura tolerante — não quebra se a migration 2026-07-31 ainda não rodou.
async function lerTransferencias(supabase: Awaited<ReturnType<typeof createServiceClient>>): Promise<Transf[]> {
  try {
    const { data } = await supabase.from('transferencias').select('id, conta_origem_id, conta_destino_id, valor, data, observacao').order('data', { ascending: false }).limit(50)
    return (data ?? []) as Transf[]
  } catch { return [] }
}

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; editar?: string }>
}) {
  const { erro, editar } = await searchParams
  const supabase = await createServiceClient()
  const { data } = await supabase.from('contas').select('id, nome, tipo, ativa').order('created_at')
  const contas = (data ?? []) as Conta[]
  const editando = editar ? contas.find((c) => c.id === editar) : undefined
  const transferencias = await lerTransferencias(supabase)
  const contasAtivas = contas.filter((c) => c.ativa)
  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? '—'
  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">Contas</h2>
        <Dica texto="Onde o dinheiro fica de verdade: o Caixa (gaveta da loja) e suas contas de banco. Cada forma de pagamento aponta pra uma conta — aí você sabe quanto tem em cada lugar." />
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">{editando ? `Editando: ${editando.nome}` : 'Nova Conta'}</h3>
        <form action={editando ? editarConta.bind(null, editando.id) : criarConta} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Nome *</label>
            <input name="nome" required defaultValue={editando?.nome ?? ''} className="field" placeholder="Ex: Caixa, Nubank, Itaú Loja" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Tipo *</label>
            <select name="tipo" defaultValue={editando?.tipo ?? 'banco'} className="field">
              <option value="caixa">Caixa (dinheiro em mãos)</option>
              <option value="banco">Banco</option>
            </select>
          </div>
          {editando && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Status</label>
              <select name="ativa" defaultValue={String(editando.ativa)} className="field">
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
              </select>
            </div>
          )}
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            {editando ? 'Salvar' : 'Adicionar'}
          </button>
          {editando && (
            <Link href="/painel/contas" className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancelar</Link>
          )}
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Conta</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {contas.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma conta.</td></tr>
            ) : contas.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.tipo === 'caixa' ? '💵' : '🏦'} {c.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{c.tipo === 'caixa' ? 'Caixa' : 'Banco'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.ativa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={`/painel/contas?editar=${c.id}`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">Editar</Link>
                    <BotaoExcluir action={deletarConta.bind(null, c.id)} mensagem="Excluir esta conta?" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transferência entre contas */}
      <div className="flex items-center gap-2 pt-2">
        <h2 className="text-xl font-bold text-gray-900">Transferências</h2>
        <Dica texto="Mover dinheiro de uma conta pra outra (ex: do Caixa da Loja pro Nubank, ou entre lojas). Fica registrado o histórico." />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">Nova transferência</h3>
        <form action={criarTransferencia} className="flex flex-wrap items-end gap-3">
          <div className="min-w-44">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">De (origem) *</label>
            <select name="conta_origem_id" required className="field">
              <option value="">—</option>
              {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.tipo === 'caixa' ? '💵' : '🏦'} {c.nome}</option>)}
            </select>
          </div>
          <div className="min-w-44">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Para (destino) *</label>
            <select name="conta_destino_id" required className="field">
              <option value="">—</option>
              {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.tipo === 'caixa' ? '💵' : '🏦'} {c.nome}</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Valor (R$) *</label>
            <input name="valor" type="number" step="0.01" min="0" required className="field" placeholder="0,00" />
          </div>
          <div className="w-40">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Data</label>
            <input name="data" type="date" defaultValue={hoje} className="field" />
          </div>
          <div className="flex-1 min-w-40">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Observação</label>
            <input name="observacao" className="field" placeholder="Opcional" />
          </div>
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Transferir
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">De</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Para</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Observação</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Valor</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {transferencias.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma transferência ainda.</td></tr>
            ) : transferencias.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(t.data)}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{nomeConta(t.conta_origem_id)}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{nomeConta(t.conta_destino_id)} <span className="text-gray-300">←</span></td>
                <td className="px-4 py-3 text-sm text-gray-500">{t.observacao || '—'}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatBRL(t.valor)}</td>
                <td className="px-4 py-3 text-center"><BotaoExcluir action={deletarTransferencia.bind(null, t.id)} mensagem="Excluir esta transferência?" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
