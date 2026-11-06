'use server'

import { createServiceClient, requirePermissao, podeAcessarLoja } from '@/lib/supabase/server'
import { logAtividade } from '@/lib/log-atividade'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { formatBRL } from '@/lib/utils'

export type ActionState = { ok: boolean; message: string } | null

// Dinheiro em reais legível ("1.234,56") — a mensagem da baixa é lida no balcão.
const brl = (v: number) => formatBRL(v)

export async function abrirCaixa(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const usuario = await requirePermissao('pdv', formData.get('access_token') as string)
    const supabase = await createServiceClient()
    const lojaId = (formData.get('loja_id') as string | null) || null

    // Atendente só abre caixa da SUA loja — evita abrir a loja errada por engano
    if (!(await podeAcessarLoja(usuario.id, lojaId))) {
      return { ok: false, message: 'Você não tem acesso ao caixa desta loja.' }
    }

    // Impede caixa duplo — agora POR LOJA (cada loja tem o seu caixa)
    let qExist = supabase.from('caixas').select('id').eq('status', 'aberto').limit(1)
    if (lojaId) qExist = qExist.eq('loja_id', lojaId)
    const { data: existente } = await qExist.maybeSingle()
    if (existente) return { ok: false, message: 'Já existe um caixa aberto nesta loja. Feche ele antes de abrir outro.' }

    const valorAbertura = Math.max(0, parseFloat(formData.get('valor_abertura') as string) || 0)
    const { data: criado, error } = await supabase.from('caixas').insert({
      valor_abertura: valorAbertura,
      obs_abertura: (formData.get('obs_abertura') as string) || null,
      status: 'aberto',
      loja_id: lojaId,
      aberto_por: usuario.id,
    }).select('id').single()
    if (error) return { ok: false, message: error.message }


    await logAtividade('caixa.abrir', {
      loja_id: lojaId,
      valor_abertura: Math.max(0, parseFloat(formData.get('valor_abertura') as string) || 0),
    }, usuario, '/painel/pdv/operacao')
    redirect(`/painel/pdv/operacao?aberto=1${lojaId ? `&loja=${lojaId}` : ''}`)
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
    return { ok: false, message: 'Erro ao abrir caixa.' }
  }
}

export async function fecharCaixa(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const usuario = await requirePermissao('pdv', formData.get('access_token') as string)
    const id = formData.get('caixa_id') as string
    if (!id) return { ok: false, message: 'Caixa não identificado.' }

    const raw = formData.get('valor_fechamento') as string
    const valorFechamento = parseFloat(raw)
    if (raw === '' || isNaN(valorFechamento) || valorFechamento < 0) {
      return { ok: false, message: 'Informe o valor contado no caixa.' }
    }

    const supabase = await createServiceClient()

    // Busca caixa p/ obter aberto_em
    const { data: caixa } = await supabase
      .from('caixas')
      .select('aberto_em, loja_id')
      .eq('id', id)
      .eq('status', 'aberto')
      .maybeSingle()
    if (!caixa) return { ok: false, message: 'Caixa não encontrado ou já fechado.' }

    // Atendente só fecha caixa da SUA loja
    if (!(await podeAcessarLoja(usuario.id, (caixa as { loja_id?: string | null }).loja_id ?? null))) {
      return { ok: false, message: 'Você não tem acesso ao caixa desta loja.' }
    }

    // DINHEIRO QUE SAIU SEM DESTINO trava o fechamento (regra do dono, 06/11):
    // retirada do caixa precisa ter lançamento (despesa paga ou transferência).
    // Sem isso o dinheiro sai da gaveta e o sistema não sabe pra onde foi — o
    // fechamento fecha certinho e ninguém enxerga (achado no caixa de 03/11:
    // 15,00 "taxa jhonatan" + 60,00 "motoboy" saíram sem lançamento nenhum).
    const { data: semDestino } = await supabase
      .from('movimentos_caixa')
      .select('valor, motivo, tipo')
      .eq('caixa_id', id)
      .is('lancamento_id', null)
      .in('tipo', ['retirada', 'sangria'])
    const totalSemDestino = (semDestino ?? []).reduce((s, m) => s + Number((m as { valor?: number }).valor ?? 0), 0)
    if (totalSemDestino > 0.005) {
      const detalhe = (semDestino ?? [])
        .slice(0, 6)
        .map((m) => `R$ ${Number((m as { valor?: number }).valor ?? 0).toFixed(2)} (${(m as { motivo?: string }).motivo ?? 'sem motivo'})`)
        .join(' · ')
      return {
        ok: false,
        message:
          `Saíram R$ ${totalSemDestino.toFixed(2)} do caixa sem destino: ${detalhe}. ` +
          'Lance a despesa (ou a transferência pro cofre/banco) antes de fechar o caixa — senão esse dinheiro fica sem rastro.',
      }
    }

    // Verifica limite de divergência configurado.
    // O "esperado" agora é calculado NO SERVIDOR (RPC) — não confia no valor do
    // navegador, que dava pra editar e esconder falta de dinheiro na gaveta.
    const { data: esperadoRpc, error: erroEsperado } = await supabase.rpc('calcular_valor_esperado', { p_caixa_id: id })
    if (erroEsperado) return { ok: false, message: `Não consegui calcular o esperado do caixa: ${erroEsperado.message}` }
    const valorEsperado = Number(esperadoRpc) || 0
    const divergencia = valorFechamento - valorEsperado
    const { data: cfgPdv } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'pdv')
      .maybeSingle()
    const limiteDivergencia: number = (cfgPdv?.valor as Record<string, number> | null)?.limite_divergencia ?? 0
    if (limiteDivergencia > 0 && Math.abs(divergencia) > limiteDivergencia) {
      return {
        ok: false,
        message: `Divergência de R$ ${Math.abs(divergencia).toFixed(2)} ultrapassa o limite configurado de R$ ${limiteDivergencia.toFixed(2)}. Corrija a contagem ou contate o supervisor.`,
      }
    }

    const { error } = await supabase
      .from('caixas')
      .update({
        status: 'fechado',
        valor_fechamento: valorFechamento,
        obs_fechamento: (formData.get('obs_fechamento') as string) || null,
        fechado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'aberto')
    if (error) return { ok: false, message: error.message }

    await logAtividade('caixa.fechar', {
      caixa_id: id,
      valor_esperado: valorEsperado,
      valor_contado: valorFechamento,
      divergencia,
      // o operador viu os avisos de regra e confirmou? fica registrado junto do
      // fechamento — é o que permite cobrar depois "você fechou com Pix sem baixa"
      ciente_dos_avisos: (formData.get('ciente') as string) === '1',
    }, usuario, '/painel/pdv/operacao')
    redirect(`/painel/pdv/operacao?fechado=1&esperado=${valorEsperado}&contado=${valorFechamento}`)
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
    return { ok: false, message: 'Erro ao fechar caixa.' }
  }
}

export async function registrarReforco(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const usuario = await requirePermissao('pdv', formData.get('access_token') as string)
    const caixaId = formData.get('caixa_id') as string
    const valor = parseFloat(formData.get('valor') as string) || 0
    if (!caixaId) return { ok: false, message: 'Caixa não identificado.' }
    if (valor <= 0) return { ok: false, message: 'Informe um valor maior que zero.' }

    const supabase = await createServiceClient()
    // Trava: não registrar em caixa já fechado (corrida entre abas — fechou noutra tela)
    const { data: cx } = await supabase.from('caixas').select('status, loja_id').eq('id', caixaId).maybeSingle()
    if (!cx || cx.status !== 'aberto') return { ok: false, message: 'Este caixa não está mais aberto.' }
    // Trava de loja: só mexe em caixa da loja que o usuário pode acessar (evita
    // reforço/retirada na loja errada — mesma regra de abrir/fechar caixa).
    if (!(await podeAcessarLoja(usuario.id, (cx as { loja_id?: string | null }).loja_id ?? null))) {
      return { ok: false, message: 'Você não tem acesso ao caixa desta loja.' }
    }
    const { error } = await supabase.from('movimentos_caixa').insert({
      caixa_id: caixaId,
      tipo: 'reforco',
      motivo: (formData.get('motivo') as string) || null,
      forma_pagamento: (formData.get('forma_pagamento') as string) || 'Dinheiro',
      valor,
    })
    if (error) return { ok: false, message: error.message }

    await logAtividade('caixa.reforco', {
      caixa_id: caixaId,
      forma: (formData.get('forma_pagamento') as string) || 'Dinheiro',
      valor,
      motivo: (formData.get('motivo') as string) || null,
    }, usuario, '/painel/pdv/operacao')
    revalidatePath('/painel/pdv/operacao')
    return { ok: true, message: 'Reforço registrado com sucesso.' }
  } catch (e) {
    return { ok: false, message: 'Erro ao registrar reforço.' }
  }
}

export async function registrarRetirada(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const usuario = await requirePermissao('pdv', formData.get('access_token') as string)
    const caixaId = formData.get('caixa_id') as string
    const valor = parseFloat(formData.get('valor') as string) || 0
    if (!caixaId) return { ok: false, message: 'Caixa não identificado.' }
    if (valor <= 0) return { ok: false, message: 'Informe um valor maior que zero.' }

    const supabase = await createServiceClient()
    // Trava: não registrar em caixa já fechado (corrida entre abas — fechou noutra tela)
    const { data: cx } = await supabase.from('caixas').select('status, loja_id').eq('id', caixaId).maybeSingle()
    if (!cx || cx.status !== 'aberto') return { ok: false, message: 'Este caixa não está mais aberto.' }
    // Trava de loja: só mexe em caixa da loja que o usuário pode acessar (evita
    // reforço/retirada na loja errada — mesma regra de abrir/fechar caixa).
    if (!(await podeAcessarLoja(usuario.id, (cx as { loja_id?: string | null }).loja_id ?? null))) {
      return { ok: false, message: 'Você não tem acesso ao caixa desta loja.' }
    }
    const { error } = await supabase.from('movimentos_caixa').insert({
      caixa_id: caixaId,
      tipo: 'retirada',
      motivo: (formData.get('motivo') as string) || null,
      forma_pagamento: (formData.get('forma_pagamento') as string) || 'Dinheiro',
      valor,
    })
    if (error) return { ok: false, message: error.message }

    await logAtividade('caixa.retirada', {
      caixa_id: caixaId,
      forma: (formData.get('forma_pagamento') as string) || 'Dinheiro',
      valor,
      motivo: (formData.get('motivo') as string) || null,
    }, usuario, '/painel/pdv/operacao')
    revalidatePath('/painel/pdv/operacao')
    return { ok: true, message: 'Retirada registrada com sucesso.' }
  } catch (e) {
    return { ok: false, message: 'Erro ao registrar retirada.' }
  }
}

// ─── Baixa do fornecedor pago pelo PIX do cliente ────────────────────────────
// O cliente paga direto na chave do fornecedor: o dinheiro NUNCA entra na conta
// nem na gaveta. O que acontece é só isto: a dívida da compra diminui.
// Por isso aqui NÃO se mexe em movimentos_caixa nem em conta_id — quem tirasse
// dinheiro de uma conta estaria inventando uma saída que não existiu (e o saldo
// da conta iria a negativo sozinho). O pagamento é lançado em ordem de
// vencimento (o mais velho primeiro), igual à planilha que o dono já usa.
//
// Trava de mês fechado: NÃO se aplica. O fato que acontece é o PAGAMENTO, hoje,
// no mês corrente; o lançamento de compra (competência) não é tocado. Baixar
// conta a pagar não muda resultado de mês nenhum — só o saldo devedor.
export async function baixarPixDoFornecedor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const usuario = await requirePermissao('pdv', formData.get('access_token') as string)
    const pessoaId = (formData.get('pessoa_id') as string | null) || ''
    const valor = Math.round((parseFloat((formData.get('valor') as string) ?? '') || 0) * 100) / 100
    if (!pessoaId) return { ok: false, message: 'Fornecedor não identificado.' }
    if (valor <= 0) return { ok: false, message: 'Informe um valor maior que zero.' }

    const supabase = await createServiceClient()
    const { data: pessoa } = await supabase.from('pessoas').select('id, nome').eq('id', pessoaId).maybeSingle()
    if (!pessoa) return { ok: false, message: 'Fornecedor não encontrado no cadastro.' }

    const { data: abertos, error: erroBusca } = await supabase
      .from('lancamentos')
      .select('id, valor, valor_pago, status, historico_pagamentos, data_vencimento')
      .eq('tipo', 'pagar')
      .eq('pessoa_id', pessoaId)
      .neq('status', 'cancelado')
      .neq('status', 'pago')
      .order('data_vencimento', { ascending: true, nullsFirst: false })
    if (erroBusca) return { ok: false, message: erroBusca.message }

    const lista = (abertos ?? [])
      .map((l) => ({
        id: l.id as string,
        valor: Number(l.valor ?? 0),
        pago: Number(l.valor_pago ?? 0),
        historico: Array.isArray(l.historico_pagamentos) ? (l.historico_pagamentos as { valor: number; forma: string; data: string; tipo?: string }[]) : [],
      }))
      .filter((l) => l.valor - l.pago > 0.005)
    if (lista.length === 0) return { ok: false, message: `Não há dívida em aberto com ${pessoa.nome}.` }

    const totalAberto = Math.round(lista.reduce((s, l) => s + (l.valor - l.pago), 0) * 100) / 100
    if (valor > totalAberto + 0.005) {
      return { ok: false, message: `O valor passa da dívida em aberto (${brl(totalAberto)}). Corrija o valor.` }
    }

    const agora = new Date().toISOString()
    let restante = valor
    let baixado = 0
    for (const l of lista) {
      if (restante <= 0.005) break
      const falta = Math.round((l.valor - l.pago) * 100) / 100
      const pago = Math.min(falta, restante)
      const novoPago = Math.round((l.pago + pago) * 100) / 100
      const quitado = novoPago >= l.valor - 0.005
      const { error } = await supabase
        .from('lancamentos')
        .update({
          valor_pago: novoPago,
          status: quitado ? 'pago' : 'pendente',
          data_pagamento: quitado ? agora : null,
          // registra COMO foi pago: sem conta e sem caixa, é o cliente que pagou
          forma_pagamento: 'PIX do cliente ao fornecedor',
          historico_pagamentos: [...l.historico, { valor: pago, forma: 'PIX do cliente ao fornecedor', data: agora }],
          updated_at: agora,
        })
        .eq('id', l.id)
      if (error) return { ok: false, message: error.message }
      restante = Math.round((restante - pago) * 100) / 100
      baixado += pago
    }

    await logAtividade('fornecedor.baixa_pix_cliente', {
      pessoa_id: pessoaId,
      fornecedor: pessoa.nome,
      valor: Math.round(baixado * 100) / 100,
      comprovantes: Number(formData.get('comprovantes') ?? 0) || null,
    }, usuario, '/painel/pdv/operacao')
    revalidatePath('/painel/pdv/operacao')
    revalidatePath('/painel/financeiro')
    revalidatePath('/painel/contas')
    return {
      ok: true,
      message: `Baixa de ${brl(baixado)} em ${pessoa.nome}. Dívida agora: ${brl(Math.max(0, totalAberto - baixado))}.`,
    }
  } catch (e) {
    return { ok: false, message: 'Erro ao dar baixa no fornecedor.' }
  }
}
