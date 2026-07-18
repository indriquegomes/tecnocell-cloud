import { createServiceClient } from '@/lib/supabase/server'

// O cruzamento: TODO log de pagamento tem que ter dinheiro correspondente no banco.
// Log sem lastro = a usuária clicou, o sistema disse OK, e o valor não entrou em lugar
// nenhum. É esse silêncio que a auditoria quebra.

export type Inconsistencia = {
  tipo: 'pagamento_sem_caixa' | 'faturamento_sem_venda'
  log_id: string
  quando: string
  usuario: string | null
  valor: number | null
  detalhe: string
  contexto: Record<string, unknown>
}

export async function auditarPagamentos(desde?: string): Promise<Inconsistencia[]> {
  const supabase = await createServiceClient()
  const corte = desde ?? new Date(Date.now() - 7 * 864e5).toISOString()

  const { data: logs, error } = await supabase
    .from('logs_atividade')
    .select('id, created_at, usuario_email, tipo_acao, contexto')
    .in('tipo_acao', ['pagamento.marcar_pago', 'pedido.faturar'])
    .gte('created_at', corte)
    .order('created_at', { ascending: false })
  if (error || !logs) return []

  const achados: Inconsistencia[] = []

  for (const log of logs) {
    const ctx = (log.contexto ?? {}) as Record<string, unknown>

    if (log.tipo_acao === 'pagamento.marcar_pago') {
      const valor = typeof ctx.valor === 'number' ? ctx.valor : null
      // A janela de 5 min existe porque log e movimento não são a mesma transação;
      // sem ela, uma gravação lenta viraria falso alerta.
      const janelaIni = new Date(new Date(log.created_at).getTime() - 6e4).toISOString()
      const janelaFim = new Date(new Date(log.created_at).getTime() + 3e5).toISOString()

      let q = supabase
        .from('movimentos_caixa')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', janelaIni)
        .lte('created_at', janelaFim)
      if (valor != null) q = q.eq('valor', valor)
      const { count } = await q

      if (!count) {
        achados.push({
          tipo: 'pagamento_sem_caixa',
          log_id: log.id,
          quando: log.created_at,
          usuario: log.usuario_email,
          valor,
          detalhe: `Baixa de "${ctx.cliente ?? 'cliente'}" marcada como paga, mas nenhuma entrada no caixa.`,
          contexto: ctx,
        })
      }
    }

    if (log.tipo_acao === 'pedido.faturar' && ctx.venda_id) {
      const { count } = await supabase
        .from('vendas')
        .select('id', { count: 'exact', head: true })
        .eq('id', ctx.venda_id as string)
      if (!count) {
        achados.push({
          tipo: 'faturamento_sem_venda',
          log_id: log.id,
          quando: log.created_at,
          usuario: log.usuario_email,
          valor: null,
          detalhe: `Pedido faturado, mas a venda ${ctx.venda_numero ?? ''} não existe.`,
          contexto: ctx,
        })
      }
    }
  }

  return achados
}
