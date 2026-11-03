'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Lança a META e a COMISSÃO do mês como contas a pagar (uma por vendedora).
// Idempotente: se já existe lançamento da mesma pessoa/loja/vencimento, pula —
// clicar duas vezes não paga em dobro.
export async function lancarComissaoDoMes(formData: FormData): Promise<void> {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()

  const mes = String(formData.get('mes') ?? '')
  const lojaId = String(formData.get('loja_id') ?? '')
  const rotuloMeta = String(formData.get('rotulo_meta') ?? '')
  if (!/^\d{4}-\d{2}$/.test(mes) || !lojaId) return

  const [ano, mm] = mes.split('-').map(Number)
  const proxMes = mm === 12 ? `${ano + 1}-01` : `${ano}-${String(mm + 1).padStart(2, '0')}`
  const vencMeta = String(formData.get('venc_meta') ?? `${proxMes}-07`)
  const vencComissao = String(formData.get('venc_comissao') ?? `${proxMes}-20`)

  const nomes = String(formData.get('vendedoras') ?? '').split('|').map((n) => n.trim()).filter(Boolean)
  const metaCada = Number(formData.get('meta_cada') ?? 0)
  const comissaoCada = Number(formData.get('comissao_cada') ?? 0)
  if (nomes.length === 0) return

  const jaTem = await supabase
    .from('lancamentos')
    .select('id')
    .eq('tipo', 'pagar')
    .eq('categoria', 'Comissão')
    .eq('loja_id', lojaId)
    .in('data_vencimento', [vencMeta, vencComissao])
    .limit(1)
  if ((jaTem.data ?? []).length > 0) {
    revalidatePath('/painel/financeiro/comissao')
    return
  }

  const linhas: Record<string, unknown>[] = []
  for (const nome of nomes) {
    if (metaCada > 0) {
      linhas.push({
        descricao: `Meta ${rotuloMeta || 'do mês'} — ${mes} — ${nome}`,
        valor: metaCada, tipo: 'pagar', status: 'pendente', valor_pago: 0,
        data_competencia: `${mes}-${String(new Date(ano, mm, 0).getDate()).padStart(2, '0')}`,
        data_vencimento: vencMeta, categoria: 'Comissão', loja_id: lojaId,
        pessoa_nome: nome, historico_pagamentos: [],
      })
    }
    if (comissaoCada > 0) {
      linhas.push({
        descricao: `Comissão 0,5% — ${mes} — ${nome} (ajustar no dia 20)`,
        valor: comissaoCada, tipo: 'pagar', status: 'pendente', valor_pago: 0,
        data_competencia: `${mes}-${String(new Date(ano, mm, 0).getDate()).padStart(2, '0')}`,
        data_vencimento: vencComissao, categoria: 'Comissão', loja_id: lojaId,
        pessoa_nome: nome, historico_pagamentos: [],
      })
    }
  }
  if (linhas.length) await supabase.from('lancamentos').insert(linhas)

  revalidatePath('/painel/financeiro/comissao')
  revalidatePath('/painel/financeiro')
}
