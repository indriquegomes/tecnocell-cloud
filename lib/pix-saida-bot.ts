// Leitura do print do PIX ENVIADO + a resposta que vai para o grupo.
//
// Puro: nada de rede aqui. O transporte (a rota do webhook) baixa a imagem, chama
// a IA e passa o JSON por `normalizarLeitura`; o casamento com o Financeiro é
// `conciliarPixSaida` (lib/pix-saida.ts). Assim a resposta que a equipe lê no
// grupo tem teste e não precisa de celular na mão para conferir.

import { formatBRL } from '@/lib/utils'
import { diaDoCampo, type ConciliacaoPixSaida, type PixSaida } from '@/lib/pix-saida'

export type LeituraComprovante = {
  ehComprovante: boolean
  valor: number | null
  dia: string | null
  /** quem PAGOU — numa saída é a nossa conta (PagBank) */
  pagador: string | null
  pagadorDoc: string | null
  /** quem RECEBEU — o cliente que devolveu a peça */
  destinatario: string | null
  destinatarioDoc: string | null
  transacaoId: string | null
}

/**
 * O que pedir à IA. Pede os DOIS lados do comprovante (quem pagou e quem recebeu)
 * porque é isso que separa "PIX que entrou" de "PIX que saiu": quem pagou sendo a
 * nossa conta = saída. Sem o lado do pagador, todo print de devolução pareceria
 * uma venda.
 */
export const PROMPT_COMPROVANTE = `Você lê comprovante de PIX brasileiro (foto ou PDF).
Extraia só o que está ESCRITO no comprovante:
- "valor": número em reais, ex 259.00 (ponto decimal). Se houver tarifa, use o valor do PIX, não da tarifa.
- "data": AAAA-MM-DD, a data da transação.
- "pagador" e "pagador_doc": quem PAGOU (rótulos: De / Origem / Pagador / Remetente). "pagador_doc" = CPF/CNPJ só dígitos.
- "destinatario" e "destinatario_doc": quem RECEBEU (rótulos: Para / Destino / Recebedor / Favorecido / Creditado para).
- "transacao_id": ID da transação / E2E, copie EXATO do comprovante (começa com E e tem 8 dígitos do banco).
Responda APENAS JSON: {"eh_comprovante": <false se NÃO for comprovante de PIX>, "valor": <número|null>, "data": "<AAAA-MM-DD>|null", "pagador": "<quem enviou>|null", "pagador_doc": "<só dígitos>|null", "destinatario": "<quem recebeu>|null", "destinatario_doc": "<só dígitos>|null", "transacao_id": "<id>|null"}`

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

/** JSON da IA (texto ou objeto) → leitura normalizada. */
export function normalizarLeitura(raw: unknown): LeituraComprovante {
  let j: Record<string, unknown> = {}
  if (typeof raw === 'string') {
    // A IA às vezes embala o JSON em ```json ... ``` ou escreve uma linha antes.
    const m = raw.match(/\{[\s\S]*\}/)
    try { j = m ? JSON.parse(m[0]) : {} } catch { j = {} }
  } else if (raw && typeof raw === 'object') {
    j = raw as Record<string, unknown>
  }
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
  opcoes: { jaConciliado?: boolean } = {},
): string {
  const valor = formatBRL(Number(pix.valor ?? 0))
  const quem = pix.destinatario?.trim() || 'sem nome no comprovante'
  const cabeca = `💸 PIX enviado: ${valor} em ${diaBR(diaDoCampo(pix.dia))} para ${quem}`

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
      return `${cabeca}\n\n✅ Casa com: ${quemLinha} · ${formatBRL(Number(c.valor ?? 0))} · ${diaBR(diaDoCampo(c.diaPagamento) ?? diaDoCampo(c.diaVencimento))} (${situacao}).\nMotivo: ${r.motivo}.\nNada foi baixado por aqui ainda — esta etapa só confere.`
    }

    default:
      return cabeca
  }
}
