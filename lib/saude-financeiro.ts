import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { hojeSP, formatBRL } from '@/lib/utils'
import { dinheiroNaGaveta, ehDinheiro, faltaPagarOuReceber, pagoReal, type Lancamento } from '@/lib/financeiro-regras'

// O CONFERENTE AUTOMÁTICO.
//
// Roda as regras do dinheiro contra o banco inteiro e devolve o que está
// quebrado, com valor. Não conserta nada: só aponta. É o que substitui o dono
// procurando erro na mão.
//
// Só leitura: nenhuma query aqui escreve, atualiza ou apaga.

type SB = Awaited<ReturnType<typeof createServiceClient>>

export type Gravidade = 'erro' | 'atencao' | 'ok'

export type Achado = {
  chave: string
  titulo: string
  regra: string
  oQueFazer: string
  gravidade: Gravidade
  qtd: number
  valor: number
  exemplos: string[]
}

// Janela das tabelas de movimento (venda, pagamento, caixa, devolução, estoque).
// Lançamento em aberto é sempre conferido inteiro, sem janela.
// ponytail: 31 dias mantém a tela rápida; para varrer o histórico inteiro, subir aqui.
const JANELA_DIAS = 31
const lim = (v: number) => Math.round(v * 100) / 100
const curtos = (arr: string[], n = 3) => arr.slice(0, n).filter(Boolean)

function achado(
  chave: string,
  titulo: string,
  regra: string,
  oQueFazer: string,
  gravidade: Exclude<Gravidade, 'ok'>,
  itens: { valor: number; rotulo: string }[],
): Achado {
  const qtd = itens.length
  return {
    chave,
    titulo,
    regra,
    oQueFazer,
    gravidade: qtd === 0 ? 'ok' : gravidade,
    qtd,
    valor: lim(itens.reduce((s, i) => s + i.valor, 0)),
    exemplos: curtos(itens.map((i) => i.rotulo)),
  }
}

export async function auditarFinanceiro(supabase: SB): Promise<Achado[]> {
  const desde = hojeSP(-JANELA_DIAS)

  const [lancamentos, perfis, vendas, caixas, devolucoes, estoque, produtos] = await Promise.all([
    fetchAll<Lancamento & { id: string; loja_id: string | null; pessoa_nome: string | null; pessoa_id: string | null; venda_id: string | null; descricao: string | null }>(
      (from, to) => supabase.from('lancamentos')
        .select('id, tipo, status, valor, valor_pago, data_pagamento, data_vencimento, loja_id, pessoa_nome, pessoa_id, venda_id, descricao')
        .order('id').range(from, to)),
    fetchAll<{ nome: string | null; pdv_loja_id: string | null }>(
      (from, to) => supabase.from('perfis').select('nome, pdv_loja_id').order('id').range(from, to)),
    fetchAll<{ id: string; numero: number | null; total: number | null; status: string | null; caixa_id: string | null }>(
      (from, to) => supabase.from('vendas')
        .select('id, numero, total, status, caixa_id')
        .eq('uso_interno', false).gte('data', desde).order('id').range(from, to)),
    fetchAll<{ id: string; valor_abertura: number | null; valor_fechamento: number | null; status: string | null }>(
      (from, to) => supabase.from('caixas')
        .select('id, valor_abertura, valor_fechamento, status')
        .gte('aberto_em', desde).order('id').range(from, to)),
    fetchAll<{ id: string; venda_id: string | null; caixa_id: string | null; tipo_credito: string | null; valor_total: number | null; pessoa_nome: string | null }>(
      (from, to) => supabase.from('devolucoes')
        .select('id, venda_id, caixa_id, tipo_credito, valor_total, pessoa_nome')
        .gte('created_at', desde).order('id').range(from, to)),
    // já filtrado no banco: só o que está negativo interessa (19.553 linhas de estoque não vêm todas)
    fetchAll<{ produto_id: string; quantidade: number | null }>(
      (from, to) => supabase.from('estoque').select('produto_id, quantidade').lt('quantidade', 0).order('id').range(from, to)),
    fetchAll<{ id: string; nome: string | null; permite_estoque_negativo: boolean | null }>(
      (from, to) => supabase.from('produtos').select('id, nome, permite_estoque_negativo').order('id').range(from, to)),
  ])

  // Pagamentos e movimentos vêm pela janela de created_at, não por lista de ids:
  // .in() com milhares de ids virava dezenas de requisições e a tela demorava.
  const [pagamentos, movimentos, formas] = await Promise.all([
    fetchAll<{ venda_id: string; valor: number | null; status: string | null; forma_pagamento_id: string | null }>(
      (from, to) => supabase.from('pagamentos_venda')
        .select('venda_id, valor, status, forma_pagamento_id')
        .gte('created_at', desde).order('id').range(from, to)),
    fetchAll<{ caixa_id: string; tipo: string; forma_pagamento: string | null; valor: number | null }>(
      (from, to) => supabase.from('movimentos_caixa')
        .select('caixa_id, tipo, forma_pagamento, valor')
        .gte('created_at', desde).order('id').range(from, to)),
    fetchAll<{ id: string; nome: string | null; tipo: string | null }>(
      (from, to) => supabase.from('formas_pagamento').select('id, nome, tipo').order('id').range(from, to)),
  ])
  const tipoDaForma = new Map(formas.map((f) => [f.id, (f.tipo || '').toLowerCase()]))

  const out: Achado[] = []
  const nome = (l: { pessoa_nome: string | null; descricao: string | null }) =>
    (l.pessoa_nome || l.descricao || 'sem nome').slice(0, 40)

  // ── Lançamentos ──────────────────────────────────────────────────────────
  out.push(achado('pago_sem_valor', 'Marcado como pago com "quanto foi pago" vazio',
    'Pago é pago: a conta usa o valor cheio quando o campo está vazio.',
    'Nada a corrigir na conta. Se quiser o dado limpo, preencher o campo — mas só com sua autorização.',
    'atencao',
    lancamentos.filter((l) => l.status === 'pago' && Number(l.valor_pago ?? 0) <= 0 && Number(l.valor ?? 0) > 0)
      .map((l) => ({ valor: Number(l.valor ?? 0), rotulo: nome(l) }))))

  out.push(achado('pago_sem_data', 'Marcado como pago sem data de pagamento',
    'Todo pagamento tem data.',
    'No fechamento do mês este lançamento não entra em nenhum mês.',
    'atencao',
    lancamentos.filter((l) => l.status === 'pago' && !l.data_pagamento)
      .map((l) => ({ valor: Number(l.valor ?? 0), rotulo: nome(l) }))))

  out.push(achado('nao_pago_com_data', 'Não está pago, mas tem data de pagamento',
    'Data de pagamento só existe em lançamento pago.',
    'Contradição: ou falta marcar pago, ou a data está sobrando.',
    'erro',
    lancamentos.filter((l) => l.status !== 'pago' && !!l.data_pagamento)
      .map((l) => ({ valor: Number(l.valor ?? 0), rotulo: nome(l) }))))

  out.push(achado('valor_zero', 'Lançamento com valor zero ou negativo',
    'Lançamento de dinheiro tem valor maior que zero.',
    'Linha sem valor não é dívida nem receita; não deveria existir.',
    'erro',
    lancamentos.filter((l) => Number(l.valor ?? 0) <= 0)
      .map((l) => ({ valor: 0, rotulo: nome(l) }))))

  out.push(achado('pago_maior', 'Pagou mais do que devia',
    'O pago não passa do valor combinado.',
    'Pode ser desconto não lançado ou digitação. Conferir um por um.',
    'atencao',
    lancamentos.filter((l) => Number(l.valor_pago ?? 0) > Number(l.valor ?? 0) + 0.005)
      .map((l) => ({ valor: Number(l.valor_pago ?? 0) - Number(l.valor ?? 0), rotulo: nome(l) }))))

  out.push(achado('pagar_sem_loja', 'Conta a pagar sem loja definida',
    'Toda conta a pagar pertence a uma loja.',
    'Sem loja, não aparece no relatório de nenhuma loja.',
    'atencao',
    lancamentos.filter((l) => l.tipo === 'pagar' && !l.loja_id && l.status === 'pendente')
      .map((l) => ({ valor: faltaPagarOuReceber(l), rotulo: nome(l) }))))

  const lojaDoPerfil = new Map(perfis.filter((p) => p.nome && p.pdv_loja_id).map((p) => [p.nome as string, p.pdv_loja_id as string]))
  out.push(achado('funcionario_loja_trocada', 'Lançamento de funcionário na loja errada',
    'Lançamento de funcionário pertence à loja dele.',
    'O total geral está certo, mas a loja aparece sem o pagamento.',
    'atencao',
    lancamentos
      .filter((l) => l.pessoa_nome && l.loja_id && lojaDoPerfil.get(l.pessoa_nome) && lojaDoPerfil.get(l.pessoa_nome) !== l.loja_id)
      .map((l) => ({ valor: Number(l.valor ?? 0), rotulo: nome(l) }))))

  out.push(achado('nome_legado', 'Nome antigo "MOTOBOY" no lugar da pessoa',
    'Lançamento aponta para a pessoa cadastrada.',
    'Nome antigo não casa com o cadastro e quebra o filtro por pessoa.',
    'atencao',
    lancamentos.filter((l) => /motoboy/i.test(l.pessoa_nome ?? ''))
      .map((l) => ({ valor: Number(l.valor ?? 0), rotulo: nome(l) }))))

  out.push(achado('fiado_sem_cadastro', 'Fiado em aberto sem cliente cadastrado',
    'Dívida de cliente aponta para o cadastro do cliente.',
    'Sem cadastro não dá para cobrar nem juntar as notas do mesmo devedor.',
    'atencao',
    lancamentos
      .filter((l) => l.tipo === 'receber' && l.status === 'pendente' && !l.pessoa_id && faltaPagarOuReceber(l) > 0.01)
      .map((l) => ({ valor: faltaPagarOuReceber(l), rotulo: nome(l) }))))

  // ── Devoluções ───────────────────────────────────────────────────────────
  const devDinheiro = devolucoes.filter((d) => (d.tipo_credito || '').toLowerCase() === 'dinheiro')
  out.push(achado('devolucao_sem_caixa', 'Devolução em dinheiro sem caixa registrado',
    'Dinheiro que sai da gaveta tem que estar escrito na gaveta.',
    'Sem movimento de caixa, o fechamento do dia acusa sobra.',
    'erro',
    devDinheiro.filter((d) => !d.caixa_id)
      .map((d) => ({ valor: Number(d.valor_total ?? 0), rotulo: (d.pessoa_nome || d.id).slice(0, 40) }))))

  const vendaPagaEmDinheiro = new Set(
    pagamentos
      .filter((p) => p.status === 'pago' && tipoDaForma.get(p.forma_pagamento_id ?? '') === 'dinheiro')
      .map((p) => p.venda_id),
  )
  out.push(achado('devolucao_dinheiro_sem_dinheiro', 'Devolução em dinheiro de venda que não foi paga em dinheiro',
    'A devolução sai pela mesma forma que entrou.',
    'É o padrão de erro que mais tira dinheiro da gaveta sem venda correspondente.',
    'erro',
    devDinheiro
      .filter((d) => d.venda_id && !vendaPagaEmDinheiro.has(d.venda_id))
      .map((d) => ({ valor: Number(d.valor_total ?? 0), rotulo: (d.pessoa_nome || d.id).slice(0, 40) }))))

  // ── Vendas × pagamentos ──────────────────────────────────────────────────
  const somaPag = new Map<string, number>()
  for (const p of pagamentos) somaPag.set(p.venda_id, (somaPag.get(p.venda_id) ?? 0) + Number(p.valor ?? 0))
  out.push(achado('venda_total_diferente', 'Venda cujo total não bate com a soma dos pagamentos',
    'O que a venda diz que foi pago e o que os pagamentos dizem têm que bater.',
    'Diferença de centavo é arredondamento; diferença grande é dinheiro sem registro.',
    'erro',
    vendas
      .filter((v) => v.status === 'concluida' && Math.abs(Number(v.total ?? 0) - (somaPag.get(v.id) ?? 0)) > 0.01)
      .map((v) => ({ valor: Math.abs(Number(v.total ?? 0) - (somaPag.get(v.id) ?? 0)), rotulo: 'venda ' + (v.numero ?? v.id).toString().slice(0, 12) }))))

  // ── Caixa ────────────────────────────────────────────────────────────────
  const movPorCaixa = new Map<string, typeof movimentos>()
  for (const m of movimentos) {
    const lista = movPorCaixa.get(m.caixa_id) ?? []
    lista.push(m)
    movPorCaixa.set(m.caixa_id, lista)
  }
  out.push(achado('caixa_contagem_diferente', 'Fechamento de caixa diferente do que entrou e saiu',
    'Contagem = abertura + recebimentos + reforços − retiradas − devoluções (só dinheiro).',
    'É sobra ou falta de dinheiro na gaveta: ou não foi registrado, ou a contagem está errada.',
    'atencao',
    caixas
      .filter((c) => c.status === 'fechado' && c.valor_fechamento != null)
      .map((c) => {
        const saldo = dinheiroNaGaveta(Number(c.valor_abertura ?? 0), movPorCaixa.get(c.id) ?? [])
        return { valor: Math.abs(Number(c.valor_fechamento) - saldo), rotulo: 'caixa ' + c.id.slice(0, 8) }
      })
      .filter((i) => i.valor > 0.01)))

  // ── Estoque ──────────────────────────────────────────────────────────────
  const nomeProduto = new Map(produtos.map((p) => [p.id, p.nome ?? p.id]))
  const permiteNegativo = new Map(produtos.map((p) => [p.id, !!p.permite_estoque_negativo]))
  out.push(achado('estoque_negativo', 'Produto com estoque negativo',
    'Estoque não fica abaixo de zero, salvo produto marcado para permitir.',
    'Significa saída sem entrada registrada. Sua contagem física é que manda.',
    'atencao',
    estoque
      .filter((e) => Number(e.quantidade ?? 0) < 0 && !permiteNegativo.get(e.produto_id))
      .map((e) => ({ valor: Math.abs(Number(e.quantidade ?? 0)), rotulo: nomeProduto.get(e.produto_id) ?? e.produto_id }))))

  // ── Devolução: reembolso nasceu "pago" sem dizer quanto foi pago ──────────
  // A função registrar_devolucao grava status pago e a data, mas não grava valor_pago.
  // A conta do dinheiro sabe compensar (pagoReal), mas o campo fica torto e some dos
  // relatórios que leem valor_pago cru.
  out.push(achado('devolucao_sem_valor_pago', 'Devolução paga com "quanto foi pago" vazio',
    'Reembolso pago tem valor pago registrado.',
    'A conta usa o valor cheio, então o total não está errado. O conserto definitivo é na função do banco (registrar_devolucao).',
    'atencao',
    lancamentos
      .filter((l) => l.status === 'pago' && Number(l.valor_pago ?? 0) <= 0 && Number(l.valor ?? 0) > 0
        && ((l as { categoria?: string | null }).categoria || '').toLowerCase().includes('devolu'))
      .map((l) => ({ valor: Number(l.valor ?? 0), rotulo: nome(l) }))))

  // ── Fiado que existe na venda mas não virou nota no financeiro ────────────
  // A venda importada do SIGE trouxe a forma "pendente" e nenhuma conta a receber.
  // A tela de Fiados lê as NOTAS, então essa dívida fica invisível.
  const janelaVenda = vendas.filter((v) => (v.status as string) !== 'cancelada')
  const idsComNota = new Set(lancamentos.map((l) => (l as { venda_id?: string | null }).venda_id).filter(Boolean) as string[])
  const pagamentosPendentes = pagamentos.filter((p) => (p.status as string) === 'pendente')
  const vendaPorId = new Map(janelaVenda.map((v) => [v.id as string, v]))
  const semNota = pagamentosPendentes.filter((p) => {
    const v = vendaPorId.get(p.venda_id as string)
    return !!v && !idsComNota.has(p.venda_id as string)
  })
  out.push(achado('venda_fiada_sem_nota', 'Venda fiada sem conta a receber no financeiro',
    'Toda venda no fiado tem que virar conta a receber.',
    'A tela de Fiados mostra só as contas; o que está aqui não aparece para cobrança. É herança da importação do SIGE — tratar depois da virada do mês.',
    'atencao',
    semNota.map((p) => ({ valor: Number(p.valor ?? 0), rotulo: 'venda #' + ((vendaPorId.get(p.venda_id as string)?.numero as number | null) ?? '?') }))))

  // ── Duplicata: mesma pessoa, mesmo valor, mesmo vencimento ───────────────
  // Não é erro automático (pode ser parcelamento igual), é convite a olhar.
  const grupos = new Map<string, { valor: number; qtd: number }>()
  for (const l of lancamentos) {
    if (l.status === 'cancelado') continue
    const chave = [l.tipo, (l as { pessoa_nome?: string | null }).pessoa_nome ?? '', l.valor ?? 0, l.data_vencimento ?? ''].join('|')
    const atual = grupos.get(chave) ?? { valor: Number(l.valor ?? 0), qtd: 0 }
    atual.qtd += 1
    grupos.set(chave, atual)
  }
  const sobras = [...grupos.entries()].filter(([, g]) => g.qtd > 1)
  out.push(achado('duplicata_suspeita', 'Mesmo valor, mesma pessoa e mesmo vencimento',
    'Duas linhas iguais no mesmo dia são duplicata ou parcelamento.',
    'Se for parcelamento, é legítimo (ex.: 3 notas de R$ 64,40 da mesma venda). Se for duplicata, cancele uma.',
    'atencao',
    sobras.map(([chave, g]) => ({ valor: g.valor * (g.qtd - 1), rotulo: chave.split('|')[1] + ' (' + g.qtd + 'x)' }))))

  return out
}

export function resumo(achados: Achado[]) {
  return {
    erros: achados.filter((a) => a.gravidade === 'erro').length,
    atencoes: achados.filter((a) => a.gravidade === 'atencao').length,
    ok: achados.filter((a) => a.gravidade === 'ok').length,
    total: achados.length,
  }
}

export { formatBRL }
