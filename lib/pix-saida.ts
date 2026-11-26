// PIX DE SAÍDA — o dinheiro que a LOJA mandou para o cliente.
//
// O comprovante de um PIX enviado tem a mesma cara do recebido (valor, data,
// pagador, destinatário). O que muda é de que lado da conta a loja está: quem
// PAGA é a nossa conta (PagBank) e quem RECEBE é o cliente. Por isso a
// conciliação aqui é o inverso do "PIX do dia" (lib/pix-do-dia.ts): o alvo não é
// a nota do fornecedor, é o lançamento "Devolução — <cliente>" que a devolução já
// criou no Financeiro.
//
// Arquivo PURO: sem Supabase, sem Telegram. O transporte busca as linhas e passa
// para cá; assim a regra que mexe em dinheiro tem teste (test/pix-saida.test.ts).
//
// Regra de decisão (escolha do dono): baixa SOZINHO só quando é inequívoco —
// valor casando e o nome do cliente casando, com UM candidato só. Qualquer
// dúvida (dois clientes com o mesmo valor, comprovante sem nome, valor diferente)
// devolve a lista para um humano confirmar no botão. Baixa errada em dinheiro
// real custa mais caro que um toque a mais.

import { normNome, semDocNaFrente } from '@/lib/pix-destinos'

/** O que o comprovante do PIX enviado trouxe. */
export type PixSaida = {
  valor: number | null
  /** dia do PIX (AAAA-MM-DD, ou timestamp que o helper converte) */
  dia: string | null
  /** quem RECEBEU o dinheiro — costuma ser a conta do cliente, não o nome do cadastro */
  destinatario: string | null
  /**
   * Nome do cliente NO SISTEMA, quando alguém mandou o cartão da devolução junto.
   * É o nome certo para procurar: o PIX vai para a conta do parente/do amigo com
   * outro nome, e procurar pelo nome do comprovante nunca acha a devolução.
   * Quando existe, este nome manda.
   */
  clienteSistema?: string | null
  /** ID da transação (E2E) — o mesmo PIX reenviado não pode ser conciliado duas vezes */
  transacaoId?: string | null
}

/** A linha do Financeiro com que o PIX pode casar (só `tipo = 'pagar'`). */
export type LancamentoPagar = {
  id: string
  valor: number
  tipo?: string | null
  /** pendente | pago — devolução em PIX já nasce 'pago' (ver abaixo) */
  status: string | null
  descricao: string | null
  pessoaNome: string | null
  /** instante do pagamento (timestamptz) ou dia */
  diaPagamento: string | null
  /** dia de vencimento (timestamptz gravado como data pura, na maioria) */
  diaVencimento: string | null
  /** devolucao_id — presente na linha que nasceu de devolução */
  devolucaoId?: string | null
  /** forma do pagamento gravada na linha (`pix`, `PIX`, `fora_do_app`…) */
  forma?: string | null
  /** a linha JÁ tem comprovante de PIX (prova com ID de transação) ligado */
  conciliado?: boolean
}

export type ConciliacaoPixSaida =
  | { tipo: 'baixar'; candidato: LancamentoPagar; motivo: string }
  | { tipo: 'escolher'; candidatos: LancamentoPagar[]; motivo: string }
  | { tipo: 'sem_par'; motivo: string }
  | { tipo: 'ignorar'; motivo: string }

/** Janela padrão entre o dia do PIX e o dia da linha no Financeiro. */
export const JANELA_DIAS = 7
/** Diferença de valor tolerada — um centavo, o mesmo arredondamento do resto do app. */
export const TOLERANCIA = 0.011

/**
 * A forma do pagamento conta como saída de PIX?
 *
 * O banco guarda DUAS grafias para a mesma coisa: a chave `fora_do_app` e o rótulo
 * que a tela mostra (`Fora do app (WhatsApp)`). Testar só a chave deixava metade
 * das devoluções de fora (peguei isso no aviso diário: 9 de 14 linhas apareciam e
 * 5 sumiam). Uma função só, usada por rota, aviso diário e simulador.
 */
export function ehSaidaPix(forma: string | null | undefined): boolean {
  return /pix|fora/i.test(String(forma ?? ''))
}

/**
 * A linha é devolução/estorno de cliente?
 *
 * Duas famílias de descrição convivem no Financeiro: `Devolução — <cliente>` e
 * `Estorno de crédito — devolução da venda #<n> — <cliente>`. Filtrar só a
 * primeira escondia 4 das 14 linhas do aviso diário.
 */
export function ehLinhaDeDevolucao(l: { devolucaoId?: string | null; descricao: string | null | undefined }): boolean {
  return !!l.devolucaoId || /^(devolu|estorno)/i.test(String(l.descricao ?? ''))
}

/**
 * Dia (AAAA-MM-DD) de um campo que pode ser três coisas diferentes:
 *  - dia puro ("2026-12-01");
 *  - data pura gravada em coluna timestamptz ("2026-12-01T00:00:00+00:00") — o dia
 *    É o próprio prefixo; converter para São Paulo aqui jogaria para 30/11 às 21h;
 *  - instante de verdade (pagamento, criação) — aí converte para São Paulo.
 * Data inválida devolve null (Intl LANÇA com data inválida, não devolve "Invalid Date").
 */
export function diaDoCampo(campo: string | null | undefined): string | null {
  const s = String(campo ?? '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?(Z|\+00:00)$/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Diferença em dias entre dois dias AAAA-MM-DD (meio-dia local, sem fuso no meio). */
export function diasEntre(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ta = new Date(a + 'T12:00:00').getTime()
  const tb = new Date(b + 'T12:00:00').getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.abs(Math.round((ta - tb) / 86400000))
}

// Partículas que não identificam ninguém ("FULANO DE TAL" × "FULANO TAL").
const PARTICULAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'])

/**
 * O destinatário do comprovante é a mesma pessoa da linha do Financeiro?
 *
 * Compara por TOKEN, não por texto inteiro: o comprovante traz "MARLENE SILVA"
 * e o cadastro tem "MARLENE DA SILVA OLIVEIRA"; o texto inteiro nunca casaria e
 * o nome parecido demais também é perigo ("ADRIANO" × "ADRIANA" são pessoas
 * diferentes) — por isso o token tem que ter 3+ letras e o mais curto dos dois
 * nomes tem que estar contido no outro quando é nome de uma palavra só.
 */
export function mesmoCliente(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = semDocNaFrente(a ?? '')
  const nb = semDocNaFrente(b ?? '')
  if (!na || !nb) return false
  if (na === nb) return true
  // Um nome é começo do outro ("ATOSCEL COMERCIO" × "ATOSCEL COMERCIO DE CELULARES").
  // 8 letras é o piso: abaixo disso "MARIA" casaria com "MARIANA".
  if (na.length >= 8 && nb.length >= 8 && (na.startsWith(nb) || nb.startsWith(na))) return true

  const ta = new Set(na.split(' ').filter((t) => t.length >= 3 && !PARTICULAS.has(t)))
  const tb = new Set(nb.split(' ').filter((t) => t.length >= 3 && !PARTICULAS.has(t)))
  if (ta.size === 0 || tb.size === 0) return false
  const comuns = [...ta].filter((t) => tb.has(t)).length
  const menor = Math.min(ta.size, tb.size)
  // Nome de uma palavra só ("MARLENE" × "MARLENE DA SILVA OLIVEIRA"): a palavra
  // tem que aparecer inteira e ter 4+ letras — "ANA" não casa com "ANABELA".
  if (menor === 1) {
    const comum = [...ta].find((t) => tb.has(t))
    return !!comum && comum.length >= 4
  }
  return comuns >= 2
}

/**
 * Casa um PIX de saída com a linha do Financeiro que ele pagou.
 *
 * Devolve `baixar` só no caso inequívoco: mesmo valor, nome do cliente casando e
 * um único candidato. Todo o resto volta para confirmação humana.
 */
export function conciliarPixSaida(
  pix: PixSaida,
  lancamentos: LancamentoPagar[],
  opcoes: { janelaDias?: number; tolerancia?: number } = {},
): ConciliacaoPixSaida {
  const janela = opcoes.janelaDias ?? JANELA_DIAS
  const tol = opcoes.tolerancia ?? TOLERANCIA

  const valor = Number(pix?.valor ?? 0)
  if (!(valor > 0)) return { tipo: 'ignorar', motivo: 'o valor do PIX não foi lido' }
  const diaPix = diaDoCampo(pix?.dia)
  if (!diaPix) return { tipo: 'ignorar', motivo: 'o PIX está sem data legível' }
  // O nome do CADASTRO manda quando existe (cartão da devolução junto do print):
  // o PIX cai na conta de outra pessoa e o nome do comprovante não está no sistema.
  const cliente = String(pix?.clienteSistema ?? '').trim() || String(pix?.destinatario ?? '').trim() || null

  const candidatos = (lancamentos ?? [])
    .filter((l) => l && l.id)
    .filter((l) => (l.tipo ?? 'pagar') === 'pagar')
    .filter((l) => !l.conciliado)
    .filter((l) => !/^cancelad/i.test(String(l.status ?? '')))
    .filter((l) => Math.abs(Number(l.valor ?? 0) - valor) <= tol)
    .map((l) => ({
      l,
      // O dia da linha: pagamento quando existe, senão vencimento. Sem nenhum dos
      // dois a linha não é descartada (dado antigo sem data), só não pontua distância.
      dist: diasEntre(diaPix, diaDoCampo(l.diaPagamento) ?? diaDoCampo(l.diaVencimento)),
    }))
    .filter((x) => x.dist === null || x.dist <= janela)
    .sort((a, b) => {
      // Linha que nasceu de devolução primeiro: é o caso real do dia a dia.
      const dev = Number(!!b.l.devolucaoId) - Number(!!a.l.devolucaoId)
      if (dev !== 0) return dev
      const pend = Number(a.l.status === 'pago') - Number(b.l.status === 'pago')
      if (pend !== 0) return pend
      return (a.dist ?? 999) - (b.dist ?? 999)
    })

  if (candidatos.length === 0) {
    return {
      tipo: 'sem_par',
      motivo: `nenhuma conta a pagar de R$ ${valor.toFixed(2).replace('.', ',')} nos ${janela} dias em volta`,
    }
  }

  const fortes = candidatos.filter((c) => mesmoCliente(cliente, c.l.pessoaNome ?? c.l.descricao))
  if (fortes.length === 1) {
    return {
      tipo: 'baixar',
      candidato: fortes[0].l,
      motivo: 'valor e nome do cliente casam, e é o único candidato',
    }
  }
  if (fortes.length > 1) {
    return {
      tipo: 'escolher',
      candidatos: fortes.map((c) => c.l),
      motivo: `${fortes.length} linhas do mesmo valor para ${cliente ?? 'este nome'}`,
    }
  }

  // O comprovante TEM nome e nenhuma linha é dessa pessoa: as linhas de mesmo
  // valor são de OUTROS clientes. Oferecê-las como opção ("escolher") é como se
  // erra a baixa — o certo é dizer que não achou e nomear o que existe no período.
  const temNome = !!String(cliente ?? '').trim()
  if (fortes.length === 0 && temNome) {
    const outras = candidatos.length
    const reais = valor.toFixed(2).replace('.', ',')
    const nota = outras === 0
      ? ''
      : outras === 1
        ? ` — existe uma conta de R$ ${reais} no período, mas de outro nome`
        : ` — existem ${outras} contas de R$ ${reais} no período, mas de outros nomes`
    return { tipo: 'sem_par', motivo: `nenhuma conta no nome de ${cliente}${nota}` }
  }

  // Sem nome legível no comprovante: só o valor sobrou como pista, então quem
  // decide é a pessoa — nunca baixa sozinho nesse caso.
  return {
    tipo: 'escolher',
    candidatos: candidatos.map((c) => c.l),
    motivo: candidatos.length === 1
      ? 'o comprovante não tem nome do cliente e só uma linha tem esse valor'
      : `${candidatos.length} linhas com esse valor — o comprovante não traz o nome`,
  }
}
