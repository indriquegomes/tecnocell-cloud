import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/paginar'
import { ehPerdaoDeDivida, rotuloMotivoDesconto } from '@/lib/desconto-fiado'

type SB = Awaited<ReturnType<typeof createServiceClient>>

// DESCONTOS CONCEDIDOS — a dívida que foi perdoada.
//
// O app não registra desconto como pagamento (senão o financeiro contaria dinheiro
// que nunca entrou): a RPC `aplicar_desconto_fiado` ABATE o `valor` da dívida e, se
// zerar, marca pago. O quanto foi perdoado fica só numa entrada do
// `historico_pagamentos` daquele lançamento — e até agora não aparecia em tela
// nenhuma, nem no relatório, nem no Financeiro.
//
// Esta função lê exatamente essa trilha: pega os lançamentos com desconto no
// histórico e devolve uma linha por desconto concedido, com data, pessoa e valor.
export type DescontoConcedido = {
  lancamento_id: string
  data: string          // AAAA-MM-DD em São Paulo
  valor: number
  pessoa: string
  descricao: string
  loja_id: string | null
  venda_id: string | null
  motivo: string
  ehPerda: boolean      // true = crédito incobrável; false = desconto/incentivo
}

type LinhaHistorico = { valor?: number | string; tipo?: string; data?: string; forma?: string }
type LinhaComDesconto = {
  id: string
  descricao: string | null
  pessoa_nome: string | null
  loja_id: string | null
  venda_id: string | null
  historico_pagamentos: LinhaHistorico[] | null
}

const diaSP = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export async function buscarDescontosConcedidos(supabase: SB): Promise<DescontoConcedido[]> {
  // `filter('cs', ...)` com o JSON em texto é o que funciona no PostgREST para
  // jsonb contendo um objeto dentro do array (`.contains()` com array devolve
  // "invalid input syntax for type json").
  const linhas = await fetchAll<LinhaComDesconto>((from, to) => supabase
    .from('lancamentos')
    .select('id, descricao, pessoa_nome, loja_id, venda_id, historico_pagamentos')
    .filter('historico_pagamentos', 'cs', '[{"tipo":"desconto"}]')
    .order('id').range(from, to))

  const out: DescontoConcedido[] = []
  for (const l of linhas ?? []) {
    for (const h of l.historico_pagamentos ?? []) {
      if (h?.tipo !== 'desconto') continue
      const valor = Number(h.valor ?? 0)
      if (!(valor > 0)) continue
      // o motivo vem dentro do campo forma, como 'Desconto — <motivo>'
      const motivoBruto = String(h.forma ?? '').replace(/^Desconto\s*—?\s*/i, '').trim()
      out.push({
        lancamento_id: l.id,
        data: diaSP(h.data),
        valor,
        pessoa: l.pessoa_nome ?? 'Sem cadastro',
        descricao: l.descricao ?? '—',
        loja_id: l.loja_id,
        venda_id: l.venda_id,
        motivo: rotuloMotivoDesconto(motivoBruto),
        ehPerda: ehPerdaoDeDivida(motivoBruto),
      })
    }
  }
  return out
}
