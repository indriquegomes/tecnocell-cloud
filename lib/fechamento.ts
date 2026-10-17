import type { createServiceClient } from '@/lib/supabase/server'

type SB = Awaited<ReturnType<typeof createServiceClient>>

// Um mês 'YYYY-MM' está fechado? Fechado = existe a chave configuracoes
// 'fechamento_mes:<mes>' (gravada pelo botão Fechar mês). Reabrir apaga a chave.
export async function mesFechado(supabase: SB, mes: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}$/.test(mes)) return false
  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave')
    .eq('chave', `fechamento_mes:${mes}`)
    .maybeSingle()
  // fail-closed: se a consulta falhou, não dá pra PROVAR que o mês está aberto —
  // num travão de dinheiro/auditoria, dúvida bloqueia, não libera.
  if (error) return true
  return !!data
}

// Uma data 'YYYY-MM-DD' cai num mês fechado? (usada pra travar edição/backdate
// de lançamento, venda e estoque no passado fechado)
export async function dataEmMesFechado(supabase: SB, dataISO: string): Promise<boolean> {
  const mes = (dataISO || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(mes)) return false
  return mesFechado(supabase, mes)
}

// Devolve a mensagem de erro se a data cair num mês fechado, senão null.
// acao = o que o usuário tentou ("editar lançamento", "cancelar venda"...).
// As server actions usam o retorno pra redirect com ?erro= — nunca throw
// (throw num <form action> sem error boundary derruba a tela inteira).
export async function travarSeMesFechado(
  supabase: SB,
  dataISO: string | null | undefined,
  acao: string,
): Promise<string | null> {
  if (!dataISO) return null
  const fechado = await dataEmMesFechado(supabase, dataISO)
  if (!fechado) return null
  const mes = (dataISO || '').slice(0, 7)
  return `Mês ${mes} já está fechado. Pra ${acao}, reabra o mês na tela Fechamento do Mês.`
}
