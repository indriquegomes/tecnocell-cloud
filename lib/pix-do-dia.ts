import type { createServiceClient } from '@/lib/supabase/server'
import { agruparPorDestino, casarFornecedor, ehContaPropria, normNome, separarComprovantes } from '@/lib/pix-destinos'
import { fetchAll } from '@/lib/paginar'

type SB = Awaited<ReturnType<typeof createServiceClient>>

export type DestinoResolvido = {
  nome: string
  total: number
  comprovantes: number
  fornecedorId: string | null
  fornecedorNome: string | null
  propria: boolean
}

/**
 * Lê os comprovantes de PIX que caíram no grupo do Telegram da loja desde uma data e
 * devolve, por recebedor, quanto foi e se é fornecedor do cadastro ou a nossa conta.
 *
 * É a mesma resolução que o bloco "PIX do dia" mostra na tela — vive aqui para o
 * fechamento de caixa poder usar a mesma régua sem depender da tela.
 */
export async function resolverPixDoDia(
  supabase: SB,
  lojaId: string,
  desde: string,
): Promise<DestinoResolvido[]> {
  const { data: loja } = await supabase.from('lojas').select('nome, cnpj').eq('id', lojaId).maybeSingle()
  const nomeLoja = (loja as { nome?: string } | null)?.nome ?? ''
  const chat = await grupoDoTelegram(supabase, nomeLoja)
  if (!chat) return []

  const [{ data: comps }, fornecedores, chaves, contasProprias] = await Promise.all([
    supabase.from('comprovantes_pix')
      .select('valor, destinatario, extraido_raw, transacao_id, status, pagador, data_pix')
      .eq('telegram_chat_id', chat).neq('status', 'furo')
      .gte('recebido_em', desde).order('recebido_em'),
    fetchAll<{ id: string; nome: string; nome_fantasia: string | null; cpf_cnpj: string | null; chave_pix: string | null; ativo: boolean | null }>(
      (from, to) => supabase.from('pessoas').select('id, nome, nome_fantasia, cpf_cnpj, chave_pix, ativo')
        .in('tipo', ['fornecedor', 'ambos']).order('nome').range(from, to)),
    fetchAll<{ pessoa_id: string; chave: string | null; favorecido: string | null }>(
      (from, to) => supabase.from('pessoa_chaves_pix').select('pessoa_id, chave, favorecido')
        .eq('ativo', true).range(from, to)),
    supabase.from('contas').select('chave_pix, titular').not('chave_pix', 'is', null),
  ])

  const meus = (comps ?? []) as { valor: number | null; destinatario: string | null; extraido_raw: unknown; transacao_id: string | null; status: string | null; pagador: string | null; data_pix: string | null }[]
  const txMinhas = [...new Set(meus.map((c) => c.transacao_id).filter(Boolean))] as string[]
  let txDoOutroGrupo: string[] = []
  if (txMinhas.length > 0) {
    const { data: outras } = await supabase.from('comprovantes_pix')
      .select('transacao_id').neq('telegram_chat_id', chat).in('transacao_id', txMinhas)
    txDoOutroGrupo = [...new Set((outras ?? []).map((o) => o.transacao_id as string))]
  }

  const sep = separarComprovantes(meus.map((c) => ({
    valor: Number(c.valor) || null,
    destinatario: c.destinatario ?? null,
    doc: (c.extraido_raw as { destinatario_doc?: string } | null)?.destinatario_doc ?? null,
    transacaoId: c.transacao_id ?? null,
    status: c.status ?? null,
    pagador: c.pagador ?? null,
    dia: c.data_pix ?? null,
  })), { transacoesDoOutroGrupo: txDoOutroGrupo })

  const docsProprios = [
    (loja as { cnpj?: string | null } | null)?.cnpj ?? null,
    ...((contasProprias.data ?? []).map((c) => c.chave_pix as string)),
  ]
  const nomesProprios = (contasProprias.data ?? []).map((c) => c.titular as string)
  const ativos = fornecedores.filter((f) => f.ativo !== false)

  return agruparPorDestino(sep.validos).map((d) => {
    const f = casarFornecedor(d, ativos, chaves)
    return {
      nome: d.nome,
      total: d.total,
      comprovantes: d.comprovantes,
      fornecedorId: f?.id ?? null,
      fornecedorNome: f?.nome ?? null,
      propria: ehContaPropria(d, docsProprios, nomesProprios),
    }
  })
}

/**
 * Grupo do Telegram da loja: o bot identifica a loja pelo nome de quem abriu o caixa
 * no grupo (`pix_periodos.aberto_por`). Sem cadastro novo, e se a loja trocar de grupo a
 * tela acompanha sozinha.
 */
export async function grupoDoTelegram(supabase: SB, nomeLoja: string): Promise<number | null> {
  const alvo = normNome(nomeLoja)
  if (!alvo) return null
  const { data } = await supabase
    .from('pix_periodos').select('telegram_chat_id, aberto_por, aberto_em')
    .order('aberto_em', { ascending: false }).limit(120)
  const conta = new Map<number, number>()
  for (const p of data ?? []) {
    const quem = normNome(p.aberto_por)
    if (!quem) continue
    if (alvo.length >= 6 && (quem.includes(alvo) || alvo.includes(quem.replace('TECNOCELL ', '')))) {
      conta.set(p.telegram_chat_id as number, (conta.get(p.telegram_chat_id as number) ?? 0) + 1)
    }
  }
  let melhor: number | null = null
  let vistos = 0
  for (const [chat, n] of conta) if (n > vistos) { vistos = n; melhor = chat }
  return melhor
}
