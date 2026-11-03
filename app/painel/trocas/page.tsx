import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { TrocasClient } from './TrocasClient'

// TROCAS COM FORNECEDOR — garantia do balcão até a peça voltar ao estoque.
// A fila vive em `trocas` (migration 2026-11-03). Se a migration ainda não
// rodou, a tela avisa em vez de quebrar.

export type TrocaLinha = {
  id: string
  produto_nome: string | null
  produto_id: string
  quantidade: number
  custo: number
  loja: string | null
  fornecedor_id: string | null
  fornecedor_nome: string | null
  pessoa_nome: string | null
  motivo: string | null
  status: string
  data_saida: string
  data_envio: string | null
  data_retorno: string | null
  produto_retorno_nome: string | null
  custo_retorno: number | null
  perda: number | null
  observacao: string | null
  dias: number
}

export default async function TrocasPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()

  const { data: deps } = await supabase.from('depositos').select('id, nome, loja_id')
  const { data: lojas } = await supabase.from('lojas').select('id, nome')
  const nomeLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome as string]))

  let linhas: TrocaLinha[] = []
  let migracaoFaltando = false
  try {
    const brutos = await fetchAll<{
      id: string; produto_id: string; produto_nome: string | null; quantidade: number | null; custo: number | null
      loja_id: string | null; deposito_saida_id: string | null; fornecedor_id: string | null; fornecedor_nome: string | null
      pessoa_nome: string | null; motivo: string | null; status: string; data_saida: string
      data_envio: string | null; data_retorno: string | null; produto_retorno_nome: string | null
      custo_retorno: number | null; perda: number | null; observacao: string | null
    }>((from, to) => supabase.from('trocas')
      .select('id, produto_id, produto_nome, quantidade, custo, loja_id, deposito_saida_id, fornecedor_id, fornecedor_nome, pessoa_nome, motivo, status, data_saida, data_envio, data_retorno, produto_retorno_nome, custo_retorno, perda, observacao')
      .order('data_saida', { ascending: false }).range(from, to))

    const agora = Date.now()
    linhas = brutos.map((t) => ({
      id: t.id,
      produto_id: t.produto_id,
      produto_nome: t.produto_nome,
      quantidade: Number(t.quantidade ?? 1),
      custo: Number(t.custo ?? 0),
      loja: t.loja_id ? (nomeLoja.get(t.loja_id) ?? null) : null,
      fornecedor_id: t.fornecedor_id,
      fornecedor_nome: t.fornecedor_nome,
      pessoa_nome: t.pessoa_nome,
      motivo: t.motivo,
      status: t.status,
      data_saida: t.data_saida,
      data_envio: t.data_envio,
      data_retorno: t.data_retorno,
      produto_retorno_nome: t.produto_retorno_nome,
      custo_retorno: t.custo_retorno == null ? null : Number(t.custo_retorno),
      perda: t.perda == null ? null : Number(t.perda),
      observacao: t.observacao,
      dias: Math.max(0, Math.floor((agora - new Date(t.data_saida).getTime()) / 86400000)),
    }))
  } catch {
    migracaoFaltando = true
  }

  // fornecedores para o seletor da classificação
  const fornecedores = await fetchAll<{ id: string; nome: string }>((from, to) =>
    supabase.from('pessoas').select('id, nome').in('tipo', ['fornecedor', 'ambos']).eq('ativo', true).order('nome').range(from, to))

  const emGarantia = linhas.filter((l) => l.status === 'aberta' || l.status === 'enviada')
  const custoEmGarantia = emGarantia.reduce((s, l) => s + l.custo * l.quantidade, 0)
  const totalPerdas = linhas.reduce((s, l) => s + (l.perda ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Trocas com fornecedor</h2>
          <p className="text-sm text-gray-500">
            Peça com defeito sai do estoque, vai para o fornecedor e volta pelo check — tudo ligado ao balcão e ao financeiro
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-sm">
            <p className="text-[11px] uppercase text-gray-500">Peças em garantia</p>
            <p className="text-lg font-bold tabular-nums text-[#1B6CA8]">{emGarantia.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-sm">
            <p className="text-[11px] uppercase text-gray-500">Custo fora do estoque</p>
            <p className="text-lg font-bold tabular-nums text-[#1B6CA8]">{formatBRL(custoEmGarantia)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-sm">
            <p className="text-[11px] uppercase text-gray-500">Perda acumulada</p>
            <p className={`text-lg font-bold tabular-nums ${totalPerdas > 0 ? 'text-rose-600' : 'text-gray-900'}`}>{formatBRL(totalPerdas)}</p>
          </div>
        </div>
      </div>

      {migracaoFaltando ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A tabela de trocas ainda não existe no banco. Rode a migration
          <code className="mx-1 rounded bg-white px-1">supabase/migrations/2026-11-03-trocas-fornecedor.sql</code>
          no SQL Editor do Supabase para a aba começar a funcionar.
        </div>
      ) : (
        <TrocasClient linhas={linhas} fornecedores={fornecedores} depositos={(deps ?? []).map((d) => ({ id: d.id as string, nome: d.nome as string }))} erro={erro} />
      )}
    </div>
  )
}
