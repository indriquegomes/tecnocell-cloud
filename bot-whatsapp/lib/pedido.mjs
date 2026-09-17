import { env } from '../../bot/lib/env.mjs'
import { limpaContexto } from './estado.mjs'
import { VENDEDORA } from './info.mjs'
import { dorme } from '../../bot/lib/util.mjs'

// Grupo que recebe o alerta de "novo pedido" quando o cliente confirma a compra.
// 🚨 VENDA AGORA 🚨 (bot entrou nele via convite). Trocável por env.
const GRUPO_ALERTA = env('BOT_WHATSAPP_ALERTA_GRUPO', '120363429762566989@g.us')

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))

// Resposta curta de confirmação a uma oferta ("sim", "ok", "quero", "manda"...).
// Só conta com contexto (produto recém-oferecido) — e limitada a 3 palavras pra
// "quero a tela do iphone 13" não virar confirmação do produto anterior.
export function ehConfirmacao(texto) {
  const t = (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  if (!t || t.split(/\s+/).length > 3) return false
  return /^(sim|s|ok|okay|beleza|certo|isso|quero|manda|aceito|fechado|fechar|me vende|me ve|vou levar|vou querer|pode separar|quero essa|quero esse|quero uma|quero um)\b/.test(t)
}

// Formata número BR (10-11 dígitos, ou 55+DDD+número). Devolve null quando o valor
// não é telefone de verdade (ex.: @lid sem resolução) — não mostra número falso.
function formataTelefone(tel) {
  const d = String(tel || '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) return '+55 (' + d.slice(2, 4) + ') ' + d.slice(4, 9) + '-' + d.slice(9)
  if (d.length >= 10 && d.length <= 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7)
  return null
}

// Cliente quer fechar: confirma pro cliente o produto separado e dispara o alerta
// no grupo pra equipe. Sem contexto (ex.: "quero comprar" sem produto antes), só
// encaminha pra vendedora como antes. nomeCliente vem do cadastro (pessoas) ou do
// contato do WhatsApp; cai pra "não identificado" se não achar.
export async function respondePedido(sock, slug, jid, telefone, contexto, nomeCliente) {
  await dorme(1500 + Math.random() * 1500)
  if (!contexto) {
    await sock.sendMessage(jid, { text: VENDEDORA })
    return
  }
  limpaContexto(slug, jid)
  const nome = contexto.nome
  const preco = contexto.preco
  await sock.sendMessage(jid, { text: '✅ Pedido recebido! O ' + nome + ' (' + brl(preco) + ') foi separado pela vendedora. Ela vai confirmar entrega e pagamento com você. 😊' })
  const tel = formataTelefone(telefone)
  const quem = nomeCliente ? (tel ? nomeCliente + ' (' + tel + ')' : nomeCliente) : (tel || 'não identificado')
  await sock.sendMessage(GRUPO_ALERTA, { text: '🔔 NOVO PEDIDO (WhatsApp)\nCliente: ' + quem + '\nProduto: ' + nome + ' — ' + brl(preco) })
}
