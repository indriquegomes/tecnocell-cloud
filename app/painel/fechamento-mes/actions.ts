'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { estoqueCustoPorLoja } from '@/lib/estoque-custo'

type Estado = { erro?: string; ok?: boolean }

// Alterna fechado/reaberto (lê 'fechado' do form). Guarda em configuracoes — sem travar nada.
export async function alternarFechamento(prev: Estado | null, formData: FormData): Promise<Estado> {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const mes = (formData.get('mes') as string) || ''
  const fechado = formData.get('fechado') === '1'
  if (!/^\d{4}-\d{2}$/.test(mes)) return { erro: 'Mês inválido.' }
  if (fechado) {
    await supabase.from('configuracoes').delete().eq('chave', `fechamento_mes:${mes}`)
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    // Congela o estoque a custo do MOMENTO do fechamento (por loja, vitrine/fundo).
    // É o "estoque final" deste mês = "estoque inicial" do mês seguinte, na MESMA régua
    // (preco_custo do app). Sem isso o consumido mês a mês não fecha.
    const estoqueFinal = await estoqueCustoPorLoja(supabase).catch(() => ({} as Record<string, { vitrine: number; fundo: number }>))
    // Caixa final que o dono conferiu (um campo por loja: caixa_final_<lojaId>).
    // Vira a abertura (caixa inicial) do mês seguinte — ninguém digita abertura de novo.
    const caixaFinal: Record<string, number> = {}
    for (const [k, v] of formData.entries()) {
      if (!k.startsWith('caixa_final_')) continue
      const lojaId = k.slice('caixa_final_'.length)
      const valor = Number(v)
      if (lojaId && Number.isFinite(valor)) caixaFinal[lojaId] = valor
    }
    await supabase.from('configuracoes').upsert({
      chave: `fechamento_mes:${mes}`,
      valor: { fechado_em: new Date().toISOString(), fechado_por: user?.email ?? user?.id ?? '—', estoque_final: estoqueFinal, caixa_final: caixaFinal },
    }, { onConflict: 'chave' })
  }
  revalidatePath('/painel/fechamento-mes')
  return { ok: true }
}
