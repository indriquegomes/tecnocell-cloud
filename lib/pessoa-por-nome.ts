import type { createServiceClient } from '@/lib/supabase/server'

type SB = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Acha o cadastro de `pessoas` pelo nome exato para gravar `pessoa_id` no lançamento.
 *
 * Lançamento a pagar/receber guarda o nome como TEXTO e, quando nasce sem `pessoa_id`,
 * fica sem ligação com a ficha: a dívida não aparece na tela da pessoa, o filtro do
 * Financeiro pode não achar, e o abatimento (que casa pelo cadastro) não enxerga.
 *
 * Devolve null quando não existe cadastro ou quando existe mais de um com o mesmo nome —
 * nesse caso é melhor ficar sem vínculo do que ligar na pessoa errada.
 */
export async function pessoaIdPorNome(supabase: SB, nome: string | null | undefined): Promise<string | null> {
  const alvo = (nome ?? '').trim()
  if (!alvo) return null
  const { data } = await supabase.from('pessoas').select('id').eq('nome', alvo).limit(2)
  return (data ?? []).length === 1 ? (data![0].id as string) : null
}
