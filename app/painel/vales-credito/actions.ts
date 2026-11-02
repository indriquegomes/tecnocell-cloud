'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { retirarDoCaixa } from '@/lib/caixa'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function emitirCredito(formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()

  const pessoa_id = formData.get('pessoa_id') as string
  const loja_id = formData.get('loja_id') as string
  const valor = parseFloat(formData.get('valor') as string) || 0
  const descricao = (formData.get('descricao') as string).trim() || 'Crédito emitido'

  if (!pessoa_id) redirect(`/painel/vales-credito?erro=${encodeURIComponent('Selecione um cliente.')}`)
  if (!loja_id) redirect(`/painel/vales-credito?erro=${encodeURIComponent('Selecione a loja do crédito.')}`)
  if (valor <= 0) redirect(`/painel/vales-credito?erro=${encodeURIComponent('Valor deve ser maior que zero.')}`)

  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('nome')
    .eq('id', pessoa_id)
    .maybeSingle()

  const { error } = await supabase.from('creditos_clientes').insert({
    pessoa_id,
    pessoa_nome: pessoa?.nome ?? 'Cliente',
    valor,
    tipo: 'credito',
    descricao,
    loja_id,
  })

  if (error) redirect(`/painel/vales-credito?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/vales-credito')
  redirect('/painel/vales-credito?ok=1')
}

// BUSCA DE CLIENTE SOB DEMANDA (para o modal "Emitir crédito").
// Antes a tela mandava TODOS os clientes da base (2.053 nomes) só para o campo de
// busca sugerir. Agora a sugestão vem do banco pelo que foi digitado.
export async function buscarClientesParaCredito(
  accessToken: string,
  termo: string,
): Promise<{ id: string; nome: string }[]> {
  await requirePermissao('financeiro', accessToken)
  const t = (termo || '').trim()
  if (t.length < 2) return []
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('pessoas')
    .select('id, nome')
    .in('tipo', ['cliente', 'ambos'])
    .ilike('nome', '%' + t + '%')
    .order('nome')
    .limit(8)
  return ((data ?? []) as { id: string; nome: string | null }[])
    .filter((p) => !!p.nome)
    .map((p) => ({ id: p.id, nome: p.nome as string }))
}

export async function estornarCredito(id: string, formData?: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()

  // O dinheiro do crédito estornado vai para o cliente AGORA ou fica para depois?
  // Sem essa resposta a conta a pagar que a RPC cria ficava pendente para sempre —
  // em outubro/2026 foram 6 lançamentos (786,00) acumulados sem ninguém dar baixa.
  // Escolher a origem = já entregou. Deixar em branco = ainda deve ao cliente.
  const origem = ((formData?.get('origem') as string | null) ?? '').trim()   // 'Dinheiro' | 'PIX' | ''
  const entregue = origem !== ''

  // Tudo numa RPC atômica (migration 2026-08-27): trava saldo negativo (mesmo
  // achado de DIEGO PALMA em 27/08 — dois créditos de R$45+R$100, R$45 já
  // gasto, estornar os dois inteiros deixou -R$45,00) + idempotência (índice
  // único em estorna_credito_id) + — se o crédito veio de uma DEVOLUÇÃO —
  // cria um lançamento 'pagar' pendente, porque estornar não pode fazer
  // dinheiro que saiu de uma devolução simplesmente sumir do sistema.
  const { data, error } = await supabase.rpc('estornar_credito_cliente', { p_credito_id: id })
  if (error) {
    const m = error.message
    let msg = m
    if (m.startsWith('SALDO_INSUFICIENTE:')) {
      const [, s, v] = m.split(':')
      msg = `Não dá pra estornar: o cliente só tem ${Math.max(0, +s).toFixed(2).replace('.', ',')} de saldo, e esse crédito valia ${(+v).toFixed(2).replace('.', ',')} — parte dele já foi usada. Estornar deixaria o saldo negativo.`
    } else if (error.code === '23505' || m.includes('creditos_clientes_estorno_unico')) {
      msg = 'Este crédito já foi estornado.'
    }
    redirect(`/painel/vales-credito?erro=${encodeURIComponent(msg)}`)
  }

  // Dinheiro entregue ao cliente: a conta a pagar nasce QUITADA. Era o buraco —
  // o caixa entregava a cédula e o lançamento ficava pendente para sempre.
  const lancId = (data as { lancamento_id?: string | null } | null)?.lancamento_id ?? null
  let avisoGaveta = ''
  if (entregue && lancId) {
    const { data: lanc } = await supabase
      .from('lancamentos')
      .select('valor, historico_pagamentos, loja_id, descricao')
      .eq('id', lancId)
      .maybeSingle()
    const valor = Number(lanc?.valor ?? 0)
    const agora = new Date().toISOString()
    const hist = Array.isArray(lanc?.historico_pagamentos) ? (lanc!.historico_pagamentos as unknown[]) : []
    const { error: erroBaixa } = await supabase.from('lancamentos').update({
      status: 'pago',
      valor_pago: valor,
      data_pagamento: agora,
      forma_pagamento: origem,
      historico_pagamentos: [...hist, { valor, forma: origem, data: agora }],
      updated_at: agora,
    }).eq('id', lancId)
    if (erroBaixa) redirect(`/painel/vales-credito?erro=${encodeURIComponent(erroBaixa.message)}`)

    // Dinheiro em espécie sai da GAVETA da loja (mesma regra da devolução).
    if (origem.toLowerCase().includes('dinheiro') && valor > 0) {
      const lojaId = (lanc as { loja_id?: string | null } | null)?.loja_id ?? null
      if (lojaId) {
        const r = await retirarDoCaixa(
          supabase, lojaId, valor,
          'Crédito estornado — dinheiro devolvido ao cliente', lancId, 'financeiro',
        )
        if (!r.ok) avisoGaveta = ` A conta foi baixada, mas a gaveta não: ${r.erro}`
      }
    }
  }

  revalidatePath('/painel/vales-credito')
  revalidatePath('/painel/financeiro')   // a dívida nova (se houver) precisa aparecer lá
  redirect(`/painel/vales-credito${avisoGaveta ? `?erro=${encodeURIComponent(avisoGaveta.trim())}` : ''}`)
}
