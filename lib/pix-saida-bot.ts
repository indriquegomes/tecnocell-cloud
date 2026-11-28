// Leitura do print do PIX ENVIADO + a resposta que vai para o grupo.
//
// Puro: nada de rede aqui. O transporte (a rota do webhook) baixa a imagem, chama
// a IA e passa o JSON por `normalizarLeitura`; o casamento com o Financeiro é
// `conciliarPixSaida` (lib/pix-saida.ts). Assim a resposta que a equipe lê no
// grupo tem teste e não precisa de celular na mão para conferir.

import { formatBRL } from '@/lib/utils'
import { normNome } from '@/lib/pix-destinos'
import { diaDoCampo, type ConciliacaoPixSaida, type PixSaida } from '@/lib/pix-saida'

export type LeituraComprovante = {
  ehComprovante: boolean
  valor: number | null
  dia: string | null
  /** quem PAGOU — numa saída é a nossa conta (PagBank) */
  pagador: string | null
  pagadorDoc: string | null
  /** quem RECEBEU — a conta do cliente, que muitas vezes tem OUTRO nome */
  destinatario: string | null
  destinatarioDoc: string | null
  transacaoId: string | null
  /** nome do cliente NO SISTEMA, quando a imagem é o cartão da devolução */
  clienteSistema: string | null
}

/** O cartão que a equipe manda junto do print: quem é o cliente no app. */
export type CartaoDevolucao = {
  clienteSistema: string | null
  valor: number | null
  chavePix: string | null
  motivo: string | null
  nomeConta: string | null
  /** true = veio com os rótulos do cartão (não é só um nome solto digitado) */
  temRotulo: boolean
}

// Rótulos do cartão de devolução, já normalizados por normNome ("📍 NOME DO
// CLIENTE EM SISTEMA" → "NOME DO CLIENTE EM SISTEMA").
const ROTULOS_CARTAO: Record<string, 'cliente' | 'valor' | 'chave' | 'motivo' | 'nomeConta'> = {
  'NOME DO CLIENTE EM SISTEMA': 'cliente',
  'CLIENTE EM SISTEMA': 'cliente',
  'NOME DO CLIENTE': 'cliente',
  'CLIENTE': 'cliente',
  'VALOR DO REEMBOLSO': 'valor',
  'VALOR': 'valor',
  'CHAVE PIX PARA REEMBOLSO': 'chave',
  'CHAVE PIX': 'chave',
  'NOME DA CONTA BANCARIA': 'nomeConta',
  'NOME DA CONTA': 'nomeConta',
  'MOTIVO DO REEMBOLSO': 'motivo',
  'MOTIVO': 'motivo',
}

/**
 * Lê o cartão da devolução (texto digitado ou lido de imagem).
 *
 * Existe porque o PIX quase nunca cai na conta do cliente do cadastro: o
 * comprovante traz "Luciana Lúcio Trece" e a devolução no app está no nome de
 * SÉRGIO CELULARES. Procurar pelo nome do comprovante nunca acha nada. O cartão
 * traz o nome do SISTEMA, que é o que casa com o Financeiro.
 *
 * Também aceita o caso pobre: uma mensagem só com o nome do cliente (sem rótulo).
 */
export function lerCartaoDevolucao(entrada: string): CartaoDevolucao | null {
  const texto = String(entrada ?? '')
  if (!texto.trim()) return null

  const campos: Record<string, string> = {}
  let temRotulo = false
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(/^\s*[^\p{L}]*([\p{L}\s]+?)\s*:\s*(.*)$/u)
    if (!m) continue
    const campo = ROTULOS_CARTAO[normNome(m[1])]
    if (!campo) continue
    const valor = m[2].trim()
    temRotulo = true
    if (valor) campos[campo] = valor
  }

  if (temRotulo) {
    return {
      clienteSistema: campos.cliente ?? null,
      valor: parseValor(campos.valor),
      chavePix: campos.chave ?? null,
      motivo: campos.motivo ?? null,
      nomeConta: campos.nomeConta ?? null,
      temRotulo: true,
    }
  }

  // Sem rótulo não é cartão. Conversa no grupo ("bom dia", "já paguei") não pode
  // virar nome de cliente: nome solto transformaria qualquer mensagem em palpite
  // sobre dinheiro. Quem sabe o formato é o cartão; o resto é silêncio.
  return null
}

/**
 * O que pedir à IA. Pede os DOIS lados do comprovante (quem pagou e quem recebeu)
 * porque é isso que separa "PIX que entrou" de "PIX que saiu": quem pagou sendo a
 * nossa conta = saída. Sem o lado do pagador, todo print de devolução pareceria
 * uma venda.
 */
export const PROMPT_COMPROVANTE = `Você lê comprovante de PIX brasileiro (foto ou PDF) e também o CARTÃO DE DEVOLUÇÃO que a loja manda junto.

ATENÇÃO: uma imagem pode conter VÁRIOS comprovantes empilhados (print de conversa), e pode conter o CARTÃO DE DEVOLUÇÃO em vez de comprovante. Leia TODOS os comprovantes que aparecerem, de cima para baixo, cada um como um item de "comprovantes".

Para CADA comprovante, extraia só o que está ESCRITO:
- "valor": número em reais, ex 259.00 (ponto decimal). Se houver tarifa, use o valor do PIX, não da tarifa.
- "data": AAAA-MM-DD, a data da transação.
- "pagador" e "pagador_doc": quem PAGOU (rótulos: De / Origem / Pagador / Remetente). "pagador_doc" = CPF/CNPJ só dígitos.
- "destinatario" e "destinatario_doc": quem RECEBEU (rótulos: Para / Destino / Recebedor / Favorecido / Creditado para).
- "transacao_id": ID da transação / E2E, copie EXATO (começa com E e tem 8 dígitos do banco).
Comprovante cortado (topo ou rodapé faltando) continua valendo: traga o que aparecer e deixe null no resto.

Se a imagem for o CARTÃO DE DEVOLUÇÃO (rótulos "NOME DO CLIENTE EM SISTEMA", "VALOR DO REEMBOLSO", "NOME DA CONTA BANCARIA", "MOTIVO DO REEMBOLSO"), devolva em "cartoes" (um item por cartão; imagem com dois cartões = dois itens), cada um com:
- "cliente_sistema" = o nome do cliente no sistema (NUNCA o nome da conta bancária)
- "valor" = valor do reembolso (NÃO é um PIX — não crie item em "comprovantes")
- "destinatario" = nome da conta bancária que recebeu
- "motivo" = motivo escrito

Responda APENAS JSON:
{"eh_comprovante": <true se houver comprovante de PIX na imagem>, "comprovantes": [{"valor": <número|null>, "data": "<AAAA-MM-DD>|null", "pagador": "<quem enviou>|null", "pagador_doc": "<só dígitos>|null", "destinatario": "<quem recebeu>|null", "destinatario_doc": "<só dígitos>|null", "transacao_id": "<id>|null"}], "cartoes": [{"cliente_sistema": "<nome no sistema>|null", "valor": <número|null>, "destinatario": "<conta que recebeu>|null", "motivo": "<motivo>|null"}]}`

function texto(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s && s !== 'null' && s !== 'undefined' ? s : null
}

/** "R$ 1.234,56" / "1234.56" / "1.234,56" → 1234.56 */
export function parseValor(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null
  let s = String(v).replace(/r\$/i, '').replace(/[^\d.,]/g, '').trim()
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

const soDigitos = (v: unknown) => String(texto(v) ?? '').replace(/\D/g, '')

/**
 * Segunda leitura, focada e curta.
 *
 * A leitura completa devolve um JSON grande; com o modelo "pensando" antes de
 * responder, a saída estourava o teto de tokens e voltava TRUNCADA — o JSON não
 * fechava, `normalizarLeitura` caía no objeto vazio e o robô dizia "valor não foi
 * lido" com a foto perfeitamente nítida (aconteceu no primeiro teste real).
 * Esta passada curta resolve sem depender do tamanho da resposta.
 */
export const PROMPT_FOCO = `Liste TODOS os comprovantes de PIX desta imagem, em JSON, sem nada fora do JSON:
{"comprovantes": [{"valor": <número em reais, ex 51.00>, "data": "<AAAA-MM-DD>", "transacao_id": "<código da transação Pix / E2E, copie exato>", "pagador": "<quem enviou>", "destinatario": "<quem recebeu>"}]}
Campo que não existir: null. Imagem com dois comprovantes = dois itens. Se não houver comprovante nenhum na imagem: {"comprovantes": []}.`

/** JSON da IA (texto ou objeto) → leitura normalizada. */
export function normalizarLeitura(raw: unknown): LeituraComprovante {
  let j: Record<string, unknown> = {}
  if (typeof raw === 'string') {
    // A IA às vezes embala o JSON em ```json ... ``` ou escreve uma linha antes.
    // `\[` no início: quando a resposta é a lista de comprovantes, o JSON começa
    // por colchete e o recorte de `{...}` pegava o primeiro item isolado.
    const m = raw.match(/[[{][\s\S]*[\]}]/)
    try { j = m ? JSON.parse(m[0]) : {} } catch { j = {} }
  } else if (raw && typeof raw === 'object') {
    j = raw as Record<string, unknown>
  }
  if (Array.isArray(j)) j = { comprovantes: j }
  const doc = (v: unknown) => { const d = soDigitos(v); return d.length >= 11 ? d : null }
  return {
    ehComprovante: j.eh_comprovante !== false,
    valor: parseValor(j.valor),
    dia: diaDoCampo(texto(j.data)),
    pagador: texto(j.pagador),
    pagadorDoc: doc(j.pagador_doc),
    destinatario: texto(j.destinatario),
    destinatarioDoc: doc(j.destinatario_doc),
    transacaoId: texto(j.transacao_id),
    clienteSistema: texto(j.cliente_sistema),
  }
}

/**
 * Leitura completa: TODOS os comprovantes da imagem + o cartão, quando a imagem
 * é o cartão.
 *
 * Uma imagem pode ser um print de conversa com dois ou três comprovantes
 * empilhados — tratá-la como "um PIX" faz o resto desaparecer sem aviso (foi o
 * que aconteceu em 27/11/2026: dois comprovantes na mesma foto, R$ 15,00 e R$
 * 77,00, e o robô respondeu uma vez só). Aqui a lista é preservada.
 */
export function normalizarLeituras(raw: unknown): {
  ehComprovante: boolean
  comprovantes: LeituraComprovante[]
  cartoes: CartaoDevolucao[]
} {
  let j: Record<string, unknown> = {}
  if (typeof raw === 'string') {
    const m = raw.match(/[[{][\s\S]*[\]}]/)
    try { j = m ? JSON.parse(m[0]) : {} } catch { j = {} }
  } else if (raw && typeof raw === 'object') {
    j = raw as Record<string, unknown>
  }
  if (Array.isArray(j)) j = { comprovantes: j }

  const lista = Array.isArray(j.comprovantes) ? (j.comprovantes as Record<string, unknown>[]) : []
  // Resposta no formato antigo (objeto único, sem "comprovantes"): ainda vale —
  // a IA às vezes ignora a lista quando a imagem tem um comprovante só.
  const itens = lista.length ? lista : [j]
  const comprovantes = itens
    .map((item) => normalizarLeitura(item))
    // Item que só trouxe a data ainda serve: é a segunda passada completando o
    // que a primeira não leu (e sem data não há janela para casar).
    .filter((l) => l.valor != null || l.destinatario != null || l.transacaoId != null || l.dia != null)

  // Cartões: o formato novo manda uma lista ("cartoes"); o antigo, um objeto só.
  const listaCartoes = Array.isArray(j.cartoes)
    ? (j.cartoes as Record<string, unknown>[])
    : (j.cartao ? [j.cartao as Record<string, unknown>] : [])
  const cartoes: CartaoDevolucao[] = listaCartoes
    .filter((c) => c && (c.valor != null || c.cliente_sistema != null))
    .map((c) => ({
      clienteSistema: texto(c.cliente_sistema),
      valor: parseValor(c.valor),
      chavePix: texto(c.chave_pix),
      motivo: texto(c.motivo),
      nomeConta: texto(c.destinatario),
      temRotulo: true,
    }))

  return {
    ehComprovante: j.eh_comprovante !== false && comprovantes.length > 0,
    comprovantes,
    cartoes,
  }
}

const diaBR = (d: string | null) => (d ? d.split('-').reverse().join('/') : 'sem data')

/** "Devolução — MARLENE DA SILVA" → "MARLENE DA SILVA" (o nome que o dono lê). */
export function clienteDoLancamento(descricao: string | null, pessoaNome: string | null): string {
  if (pessoaNome && pessoaNome.trim()) return pessoaNome.trim()
  const d = String(descricao ?? '').trim()
  return d.replace(/^Devolu[çc][ãa]o\s*[—–-]\s*/i, '').trim() || d || 'sem nome'
}

/**
 * A resposta para o grupo. Português do dia a dia, sem jargão: quem lê é o dono e
 * a atendente. O valor e o nome sempre aparecem, mesmo quando não achou par —
 * é a partir deles que alguém confere no extrato.
 *
 * `acoes` diz o que o robô ainda NÃO fez. Enquanto a baixa automática não estiver
 * liberada, a mensagem deixa isso escrito: mensagem que parece baixa e não baixou
 * é pior que mensagem nenhuma.
 */
export function mensagemDoPix(
  pix: PixSaida,
  r: ConciliacaoPixSaida,
  opcoes: { jaConciliado?: boolean; pagou?: boolean } = {},
): string {
  const valor = formatBRL(Number(pix.valor ?? 0))
  const quem = pix.destinatario?.trim() || 'sem nome no comprovante'
  const doSistema = String(pix.clienteSistema ?? '').trim()
  // Quando o PIX foi para a conta de outra pessoa (parente, amigo), a mensagem
  // mostra os DOIS nomes: sem isso ninguém entende por que o robô falou de um
  // cliente que não aparece no comprovante.
  const linhaCliente = doSistema && normNome(doSistema) !== normNome(quem)
    ? `\n👤 Cliente no sistema: ${doSistema}`
    : ''
  const cabeca = `💸 PIX enviado: ${valor} em ${diaBR(diaDoCampo(pix.dia))} para ${quem}${linhaCliente}`

  if (opcoes.jaConciliado) {
    return `${cabeca}\n\n⚠️ Este PIX já foi conciliado com uma conta do Financeiro. Se é outro pagamento, mande o print de novo mesmo assim — o ID do PIX é diferente.`
  }

  switch (r.tipo) {
    case 'ignorar':
      return `${cabeca}\n\n❓ Não deu para conciliar: ${r.motivo}. Confira o valor/data na tela do pagamento e lance na mão se precisar.`

    case 'sem_par':
      return `${cabeca}\n\n⚠️ Saiu dinheiro e não achei a conta correspondente no Financeiro: ${r.motivo}.\nProvável devolução que ninguém registrou no app. Abra em **Devoluções** e lance o reembolso em PIX — ou avise o dono.`

    case 'escolher': {
      const linhas = r.candidatos.slice(0, 5).map((c, i) => {
        const quemLinha = clienteDoLancamento(c.descricao, c.pessoaNome)
        const situacao = c.status === 'pago' ? 'já paga' : 'em aberto'
        return `${i + 1}. ${quemLinha} · ${formatBRL(Number(c.valor ?? 0))} · ${diaBR(diaDoCampo(c.diaPagamento) ?? diaDoCampo(c.diaVencimento))} · ${situacao}`
      })
      const resto = r.candidatos.length > 5 ? `\n(+${r.candidatos.length - 5} parecidas)` : ''
      return `${cabeca}\n\n🤔 Achei ${r.candidatos.length} conta(s) com esse valor — ${r.motivo}:\n${linhas.join('\n')}${resto}\n\nQual é? Aponte no Financeiro (nada foi baixado por aqui ainda).`
    }

    case 'baixar': {
      const c = r.candidato
      const quemLinha = clienteDoLancamento(c.descricao, c.pessoaNome)
      const situacao = c.status === 'pago' ? 'já estava paga no app' : 'estava em aberto'
      const forma = String(c.forma ?? '').trim()
      // Pagamento marcado como "fora do app" não desconta do banco. Se o PIX saiu do
      // PagBank, o saldo fica inflado — e é o tipo de diferença que só aparece no
      // fechamento do mês. O robô não troca a forma sozinho: avisa quem pode trocar.
      const avisoForma = /fora/i.test(forma)
        ? '\n⚠️ Esta conta está como "fora do app", que NÃO baixa do PagBank. Se o PIX saiu do banco, troque a forma para PIX no Financeiro.'
        : ''
      // O desfecho da conta em aberto depende do que o robô conseguiu fazer: dizer
      // "marque Pago na tela" quando ele já marcou seria confundir quem lê.
      const desfecho = c.status === 'pago'
        ? ''
        : opcoes.pagou
          ? '\n💸 Marquei esta conta como PAGA no app: forma PIX, no banco do PagBank, com a data do PIX.'
          : '\nA conta continua EM ABERTO no app — marque Pago na tela quando o dinheiro sair.'
      return `${cabeca}\n\n✅ ESTORNO CONFIRMADO — ${quemLinha} · ${formatBRL(Number(c.valor ?? 0))} · ${diaBR(diaDoCampo(c.diaPagamento) ?? diaDoCampo(c.diaVencimento))} (${situacao}).\nMotivo: ${r.motivo}.\n🔗 Comprovante ligado a esta conta como prova.${avisoForma}${desfecho}`
    }

    default:
      return cabeca
  }
}
