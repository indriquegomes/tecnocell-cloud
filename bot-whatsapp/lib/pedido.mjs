import { env } from '../../bot/lib/env.mjs'
import { limpaContexto } from './estado.mjs'
import { VENDEDORA } from './info.mjs'
import { dorme } from '../../bot/lib/util.mjs'

// Grupo que recebe o alerta de "novo pedido" quando o cliente confirma a compra.
// 🚨 VENDA AGORA 🚨 (bot entrou nele via convite). Trocável por env.
const GRUPO_ALERTA = env('BOT_WHATSAPP_ALERTA_GRUPO', '120363429762566989@g.us')
// Número que recebe o @mention no alerta do grupo (notificação específica pra equipe).
const MENCIONAR = env('BOT_WHATSAPP_ALERTA_MENCIONAR', '5524998266051')
const MENCIONAR_JID = MENCIONAR + '@s.whatsapp.net'
// Se o dono não LER o alerta de venda no grupo nesse tempo, o bot avisa de novo.
const TEMPO_LEMBRETE_MS = 5 * 60 * 1000

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

// Alertas de venda aguardando o dono LER no grupo (idDaMensagem -> { visto, nome, preco, quem }).
// O Baileys avisa via recibo de leitura; se em TEMPO_LEMBRETE_MS ninguém do número
// mencionado leu, o bot reavisa — evita venda esquecida no meio do expediente.
const alertasPendentes = new Map()

// Recibo de leitura do grupo -> marca o alerta como visto pelo dono.
export function marcaAlertaVisto(messageId, userJid) {
  const a = alertasPendentes.get(messageId)
  if (!a || a.visto) return
  // só conta quando quem leu é o número mencionado (o dono), não outro da equipe
  if (userJid && !userJid.startsWith(MENCIONAR)) return
  a.visto = true
}

function agendaLembrete(sock, messageId) {
  const timer = setTimeout(async () => {
    const a = alertasPendentes.get(messageId)
    if (!a || a.visto) return
    await sock.sendMessage(GRUPO_ALERTA, {
      text: '@' + MENCIONAR + ' ⏰ LEMBRETE — venda ainda NÃO vista:\nCliente: ' + a.quem + '\nProduto: ' + a.nome + ' — ' + brl(a.preco),
      mentions: [MENCIONAR_JID],
    }).catch((e) => console.error('[alerta] falha no lembrete:', e?.message || e))
    alertasPendentes.delete(messageId)
  }, TEMPO_LEMBRETE_MS)
  timer.unref?.() // não segura o processo por causa do timer
}

// Cliente quer fechar: confirma pro cliente o produto separado e dispara o alerta
// no grupo pra equipe. Sem contexto (ex.: "quero comprar" sem produto antes), só
// encaminha pra vendedora como antes. nomeCliente vem do cadastro (pessoas) ou do
// contato do WhatsApp; cai pra "não identificado" se não achar.
export async function respondePedido(sock, slug, jid, telefone, contexto, nomeCliente) {
  await dorme(400 + Math.random() * 400)
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
  const alerta = await sock.sendMessage(GRUPO_ALERTA, {
    text: '@' + MENCIONAR + ' 🔔 NOVO PEDIDO (WhatsApp)\nCliente: ' + quem + '\nProduto: ' + nome + ' — ' + brl(preco),
    mentions: [MENCIONAR_JID],
  })
  // agenda o lembrete de 5 min (se o dono não ler o alerta, avisa de novo)
  if (alerta?.key?.id) {
    alertasPendentes.set(alerta.key.id, { visto: false, nome, preco, quem })
    agendaLembrete(sock, alerta.key.id)
  }
}
