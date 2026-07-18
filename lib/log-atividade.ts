import { createServiceClient } from '@/lib/supabase/server'

// Registrar a intenção da usuária é o ponto: o log entra ANTES/independente do efeito no
// banco. É essa separação que permite achar a ação que foi clicada mas não aconteceu.
//
// Nunca lança: uma falha ao gravar log não pode derrubar um recebimento de dinheiro.

export type TipoAcao =
  | 'pagamento.marcar_pago'
  | 'pagamento.receber_crediario'
  | 'venda.finalizar'
  | 'pedido.faturar'
  | 'devolucao.criar'
  | 'caixa.abrir'
  | 'caixa.fechar'

export async function logAtividade(
  tipo: TipoAcao | string,
  contexto: Record<string, unknown> = {},
  usuario?: { id: string; email: string | null } | null,
  url?: string,
): Promise<void> {
  try {
    const supabase = await createServiceClient()
    await supabase.from('logs_atividade').insert({
      usuario_id: usuario?.id ?? null,
      usuario_email: usuario?.email ?? null,
      tipo_acao: tipo,
      contexto,
      url: url ?? null,
      origem: 'server',
    })
  } catch {
    // silêncio proposital — ver comentário do topo
  }
}
