import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys'
import { pino } from 'pino'
import qrcode from 'qrcode-terminal'
import QRCode from 'qrcode'
import { classificaPergunta, geraResposta } from './lib/ia.mjs'
import { buscaProdutos, buscaProdutosAmplo, buscaPorPrioridade, buscaEstoque, buscaChavePix, buscaEntregas, marcarEntregaBot, resumoLoja, ehConsultaGenerica, ehMarcaSolta, buscaTabelaDoCliente, buscaTabelaVarejoId, precosDaTabela, buscaTabelaPorNome, categoriasDe, modelosDistintos, resolveSelecao, buscaComAlternativa } from './lib/produtos.mjs'
import { montaResposta, AVISO } from './lib/resposta.mjs'
import { ENDERECO, HORARIO, CADASTRO, montaPolitica, ENCOMENDA, VENDEDORA, PERGUNTA_APARELHO, FORA_HORARIO } from './lib/info.mjs'
import { registraTroca, jaAvisouHoje, marcaAvisoHoje } from './lib/db.mjs'
import { guardaPendente, pegaPendente, limpaPendente, guardaContexto, pegaContexto, limpaContexto, guardaCategoria, pegaCategoria, guardaModelos, pegaModelos, limpaModelos } from './lib/estado.mjs'
import { respondePedido, ehConfirmacao, marcaAlertaVisto } from './lib/pedido.mjs'
import { aprendeContato, resolveTelefone, constroiMapa, resolveNome, aprendeNome } from './lib/lid-telefone.mjs'
import { dorme } from '../bot/lib/util.mjs'
import { env, RAIZ_REPO } from '../bot/lib/env.mjs'

const logger = pino({ level: 'silent' })
const LINK_ENCOMENDAS = env('BOT_WHATSAPP_LINK_ENCOMENDAS')

// Heartbeat pro vigia (monitor.mjs): prova de vida do bot. Grava o horário quando
// conecta OU processa mensagem. O vigia reinicia se o arquivo ficar velho demais.
const ARQ_HEARTBEAT = path.join(RAIZ_REPO, 'bot-whatsapp', 'data', 'heartbeat.txt')
let conectado = false
function bateCoracao() { fs.writeFile(ARQ_HEARTBEAT, String(Date.now()), () => {}) }
// Enquanto conectado, renova a prova de vida a cada 5 min (senão à noite, sem
// mensagem nenhuma, o vigia acharia o bot morto e reiniciaria à toa).
setInterval(() => { if (conectado) bateCoracao() }, 5 * 60 * 1000)

// Estado da sessão ativa (pro health check e pra evitar socket duplicado).
let sockAtual = null
let sessaoAtual = null // { slug, depositoId, pastaAuth }
let geracao = 0 // cada iniciaSessao ganha um número; só a chamada mais recente "vence"
let recuperando = false // trava contra reconexão em loop no health check
let ultimoRecv = Date.now() // última mensagem recebida — pra detectar "conectado mas mudo" (half-open)

// Loja aberta 7:40–19:30 (São Paulo). Fora disso, "sem mensagem" é normal e não deve
// forçar reconexão (senão de madrugada o bot reinicia à toa e corrói a sessão).
function emHorarioComercial() {
  const hm = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })
  const [h, m] = hm.split(':').map(Number)
  const minutos = h * 60 + m
  return minutos >= 7 * 60 + 40 && minutos <= 19 * 60 + 30
}

// Health check: o Baileys às vezes derruba o WebSocket SEM emitir 'connection.update
// close' (queda silenciosa). Aí o bot fica "conectado" (heartbeat batendo via timer)
// mas não recebe nada — o vigia nunca reinicia e o bot fica mudo. Este intervalo olha
// o ws de verdade a cada 60s e reconecta se ele fechou sem aviso.
setInterval(() => {
  if (recuperando || !conectado || !sockAtual || !sessaoAtual) return
  const ws = sockAtual.ws
  const wsFechado = ws && typeof ws.isOpen === 'boolean' && !ws.isOpen
  // "Conectado mas mudo": ws AINDA aberto (half-open) porém nenhuma mensagem chegou em
  // 15 min dentro do horário comercial — queda silenciosa que o ws.isOpen NÃO pega
  // (o TCP fica "Established" mas o WhatsApp parou de mandar dados).
  const mudo = emHorarioComercial() && (Date.now() - ultimoRecv > 15 * 60 * 1000)
  if (wsFechado || mudo) {
    recuperando = true
    conectado = false
    const motivo = wsFechado ? 'ws fechado sem aviso' : 'sem mensagens há 15min em horário comercial'
    console.error(`[${sessaoAtual.slug}] conexão caiu em silêncio (${motivo}). Reconectando...`)
    // Não chama sockAtual.end() aqui: o end dispara o handler de 'close' (que também
    // agenda reconexão) e abriria DUAS sessões em paralelo. A nova iniciaSessao (abaixo)
    // fecha o socket velho depois de incrementar a geração — aí o close antigo vira no-op.
    const { slug, depositoId, pastaAuth } = sessaoAtual
    setTimeout(() => {
      iniciaSessao({ slug, depositoId, pastaAuth })
        .catch((e) => console.error(`[${slug}] falha ao reconectar (health check):`, e?.message || e))
        .finally(() => { recuperando = false })
    }, 5000)
  }
}, 60 * 1000)
// Acima desse tanto de opções, e sendo MODELOS diferentes ("j7" casa Prime/Neo/Pro/
// Metal), o bot pergunta qual modelo exato em vez de despejar a lista inteira.
// 7 é o teto de variações por peça no catálogo (dono confirmou 19/09): mais que
// isso é sinal de que a busca pescou modelos demais.
const LIMITE_OPCOES = 7

// 401 loggedOut, 403 forbidden (conta banida), 440 connectionReplaced (WhatsApp
// Web aberto em outro lugar) e 500 badSession não se resolvem tentando de novo —
// martelar reconexão numa conta já banida/deslogada só piora. Só reconecta em
// código transitório (408, 428, 503, 515, sem código, erro de rede).
const CODIGOS_DESCONEXAO_DEFINITIVA = new Set([401, 403, 440, 500])

// Backoff exponencial de reconexão. Antes o bot tentava a cada 5s pra sempre — numa
// madrugada de rede ruim isso virava 300+ quedas e CORROMPIA a sessão (o mesmo vínculo
// reconectado em loop faz o WhatsApp invalidar a credencial). Agora cada queda espaça
// mais: 5s → 10s → 20s → 40s → ... até 30min. Conectou de novo → zera o contador.
const reconexoesSeguidas = new Map() // slug -> número de quedas sem conseguir reconectar
function esperaReconexao(slug) {
  const n = reconexoesSeguidas.get(slug) || 0
  // 5s * 2^n, teto de 30min
  return Math.min(5000 * Math.pow(2, n), 30 * 60 * 1000)
}

// Só conversa individual: remoteJid de grupo termina em @g.us, o de pessoa em
// @s.whatsapp.net (ou @lid em contas mais novas — ver Baileys docs). Mensagem
// própria (fromMe) nunca deve virar pergunta pro classificador.
function elegivel(msg) {
  if (msg.key.fromMe) return false
  const jid = msg.key.remoteJid || ''
  if (jid.endsWith('@g.us')) return false
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')
}

function textoDaMensagem(msg) {
  return msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || null
}

export async function iniciaSessao({ slug, depositoId, pastaAuth }) {
  const minhaGeracao = ++geracao // socket mais novo vence; os antigos fecham sozinhos
  bateCoracao() // marca "vivo" já no início (aguardando QR/connect) — o vigia não reinicia à toa

  // Backup de creds: se creds.json corromper (crash no meio da gravação), restaura
  // do .bak e NÃO precisa escanear QR de novo.
  try {
    const creds = JSON.parse(fs.readFileSync(path.join(pastaAuth, 'creds.json'), 'utf8'))
    if (!creds?.me?.id || !creds?.signedIdentityKey) throw new Error('incompleto')
  } catch {
    try {
      const bak = JSON.parse(fs.readFileSync(path.join(pastaAuth, 'creds.json.bak'), 'utf8'))
      if (bak?.me?.id && bak?.signedIdentityKey) {
        fs.writeFileSync(path.join(pastaAuth, 'creds.json'), JSON.stringify(bak))
        console.log(`[${slug}] creds corrompido — restaurado do backup (sem QR)`)
      }
    } catch {}
  }

  const { state, saveCreds } = await useMultiFileAuthState(pastaAuth)
  const { version } = await fetchLatestBaileysVersion()

  // syncFullHistory fica FALSE (padrão). Com true o Baileys baixa e reprocessa o
  // HISTÓRICO INTEIRO de mensagens na conexão — mensagem velha repetida vira
  // "MessageCounterError / Bad MAC" (contador já usado), dessincroniza a sessão e é
  // a causa provável do "bot parou de responder". O mapa lid->telefone NÃO depende
  // disso: ele vem de sock.onWhatsApp() (lib/lid-telefone.mjs) + contacts.upsert.
  // Identifica como Chrome normal (não o 'Baileys' default) — reduz queda de sessão.
  const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false, browser: Browsers.ubuntu('Chrome') })

  // Fecha socket anterior da MESMA pasta de auth antes de assumir o novo — dois
  // vínculos abertos ao mesmo tempo fazem o WhatsApp trocar o vínculo (440) e
  // invalidar a sessão = novo QR. Só a chamada mais recente fica de pé.
  if (sockAtual && sessaoAtual?.pastaAuth === pastaAuth) {
    try { sockAtual.end?.(new Error('substituido')) } catch {}
  }
  sockAtual = sock
  sessaoAtual = { slug, depositoId, pastaAuth }

  // Serializa a gravação de creds: 'creds.update' dispara em rajada durante
  // reconexão, e gravar em paralelo dava EBUSY — que corrompe o creds.json no
  // meio da escrita e derruba a sessão (QR de novo).
  let filaCreds = Promise.resolve()
  sock.ev.on('creds.update', () => {
    filaCreds = filaCreds
      .then(() => saveCreds())
      .then(() => {
        try {
          fs.copyFileSync(path.join(pastaAuth, 'creds.json'), path.join(pastaAuth, 'creds.json.bak'))
        } catch {}
      })
      .catch((e) => console.error(`[${slug}] falha ao salvar credenciais:`, e))
  })

  // WhatsApp novo entrega o remetente como @lid (ID anônimo). O número real só
  // vem nos eventos de contato — alimenta o mapa lid->telefone antes de responder.
  sock.ev.on('contacts.upsert', (contatos) => {
    for (const c of contatos ?? []) aprendeContato(c)
  })
  sock.ev.on('contacts.update', (contatos) => {
    for (const c of contatos ?? []) aprendeContato(c)
  })

  let fechando = false // guarda contra 'close' disparando 2x pro mesmo socket (erro de stream) e abrindo 2 cadeias de reconexão em paralelo -> respostas duplicadas
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      console.log(`\n[${slug}] escaneie o QR code no WhatsApp (Aparelhos conectados):\n`)
      qrcode.generate(qr, { small: true })
      // salva o QR como PNG pra escanear com a câmera (o QR do terminal distorce)
      const caminhoQr = path.join(RAIZ_REPO, 'bot-whatsapp', 'data', `qr_${slug}.png`)
      QRCode.toFile(caminhoQr, qr, { width: 512, margin: 2 })
        .then(() => console.log(`[${slug}] QR salvo em: ${caminhoQr}`))
        .catch(() => {})
    }
    if (connection === 'close') {
      if (fechando) return
      if (minhaGeracao !== geracao) return // socket já substituído por outro mais novo
      fechando = true
      conectado = false
      sock.ev.removeAllListeners()

      const code = lastDisconnect?.error?.output?.statusCode
      const definitivo = CODIGOS_DESCONEXAO_DEFINITIVA.has(code)
      // Reconecta SEMPRE. Em queda definitiva (sessão invalidada) o reconnect
      // gera um QR novo sozinho (sem apagar pasta na mão) — mas a conta banida
      // (403) não tem volta e só vai ficar tentando; loga pra não ficar mudo.
      if (definitivo) {
        console.error(`[${slug}] conexão caiu (${code}). Sessão inválida — reconectando pra gerar QR novo.`)
      }
      // Ainda sem sessão (aguardando QR): o WS de pareamento do WhatsApp expira em
      // ~60s e fecha com 408. NÃO aplicar backoff aqui — senão o bot fica 10s→30min
      // dormindo e o QR some por longos períodos. Reconecta na hora pra manter o QR
      // sempre fresco.
      const semSessao = !sock.user
      const n = semSessao ? 0 : (reconexoesSeguidas.get(slug) || 0) + 1
      reconexoesSeguidas.set(slug, n)
      const espera = semSessao ? 2000 : esperaReconexao(slug)
      console.error(`[${slug}] conexão caiu (${code || 'sem código'}). Reconectando em ${Math.round(espera / 1000)}s (queda ${n})...`)
      setTimeout(() => {
        iniciaSessao({ slug, depositoId, pastaAuth }).catch((e) => console.error(`[${slug}] falha ao reconectar:`, e))
      }, espera)
    } else if (connection === 'open') {
      // Socket velho conectou depois que um mais novo assumiu: fecha na hora. Dois
      // vínculos abertos juntos = WhatsApp troca o vínculo e invalida a sessão.
      if (minhaGeracao !== geracao) {
        try { sock.end?.(new Error('socket duplicado')) } catch {}
        return
      }
      console.log(`[${slug}] conectado ao WhatsApp.`)
      conectado = true
      ultimoRecv = Date.now()
      bateCoracao()
      reconexoesSeguidas.set(slug, 0) // conectou: zera o backoff
      // constrói/atualiza o mapa lid->telefone em segundo plano (não bloqueia o bot)
      constroiMapa(sock).catch((e) => console.error(`[${slug}] falha ao construir mapa lid->telefone:`, e?.message || e))
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    ultimoRecv = Date.now()
    bateCoracao()
    for (const msg of messages) {
      if (!elegivel(msg)) continue
      const texto = textoDaMensagem(msg)
      if (!texto) continue
      aprendeNome(msg.key.remoteJid, msg.pushName) // guarda o nome de exibição pra identificar no alerta
      try {
        await processaMensagem(sock, { slug, depositoId }, msg.key.remoteJid, texto)
      } catch (e) {
        console.error(`[${slug}] falha ao processar mensagem:`, e?.message || e) // não deixa uma mensagem derrubar a sessão inteira
      }
    }
  })

  // Recibo de leitura: quando o dono LÊ o alerta de venda no grupo, marca como
  // visto pra não disparar o lembrete de 5 min.
  sock.ev.on('message-receipt.update', (receipts) => {
    for (const r of receipts ?? []) {
      if (!r.receipt?.readTimestamp || !r.key?.id) continue
      marcaAlertaVisto(r.key.id, r.receipt.userJid || '')
    }
  })
}

// Resolve a resposta do cliente contra a lista que o bot mostrou, de forma
// DETERMINÍSTICA (sem IA — a IA errava de forma inconsistente aqui: "incell 87"
// e "a de 65" viravam busca nova e traziam fone gamer). Número → índice; preço
// → casa o preço mostrado; palavra de qualidade/cor → filtra pelo nome.
// Devolve null se não há pendência ou não entendeu (aí cai na busca nova).
async function tentaResolverPendente(loja, jid, texto) {
  const pendente = pegaPendente(loja.slug, jid)
  if (!pendente) return null

  const modelos = pegaModelos(loja.slug, jid)
  const resolvido = resolveSelecao(texto, pendente, modelos)
  if (resolvido.length === 0) {
    limpaPendente(loja.slug, jid) // não entendeu — abandona a pendência, trata como assunto novo
    limpaModelos(loja.slug, jid)
    return null
  }
  // Resolveu: limpa a lista de modelos (a escolha já foi feita). A pendência de
  // produtos continua — o fluxo re-guarda com o preço de tabela e mostra a lista.
  limpaModelos(loja.slug, jid)
  return resolvido
}

// Assuntos fixos fora de preço/estoque (chave PIX, horário...). Devolve a resposta
// pronta ou null — null segue pro fluxo normal de produto.
async function respondeAssuntoFixo(texto) {
  const t = (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // "entregue N" — o motoboy marca a entrega pelo WhatsApp (palavra-chave).
  const mEntregue = t.match(/^entregue[!.]?\s*(\d+)/)
  if (mEntregue) {
    const numero = Number(mEntregue[1])
    const ok = await marcarEntregaBot(numero).catch(() => null)
    return ok != null
      ? `✅ Entrega #${ok.numero} entregue${ok.cliente ? ` — ${ok.cliente}` : ''}${ok.pecas ? ` (${ok.pecas})` : ''}!`
      : `Não achei a entrega #${numero} em aberto.`
  }
  // PIX: qualquer menção -> chave + pedido de comprovante
  if (/\bpix\b/.test(t)) {
    const p = await buscaChavePix()
    return p.chave ? `💠 Chave PIX da loja:\n${p.chave}${p.titular ? `\nTitular: ${p.titular}` : ''}\n\nEnvie o comprovante completo e atenção ao nome do PIX. Obrigado!` : null
  }
  // endereço / localização
  if (/(endereco|onde fica|localizacao|onde vcs|onde e a loja|onde fica a loja)/.test(t)) return ENDERECO
  // horário
  if (/(horario|que horas|abre|funciona|hora de)/.test(t)) return HORARIO
  // cadastro
  if (/(cadastro|cadastrar|me cadastro|quero me cadastrar)/.test(t)) return CADASTRO
  // encomenda (antes de 'regras' — "regras de encomenda" cai aqui, não na política)
  if (/(encomend)/.test(t)) return ENCOMENDA
  // política / entrega / garantia (entregas vêm do painel, não mais hardcoded)
  if (/(politica|regras|garantia|entrega|logistica|frete)/.test(t)) return montaPolitica(await buscaEntregas())
  return null
}

// Fora do expediente? Seg-Sex 08h-19h, Sáb 08h-17h, Dom fechado (fuso da loja).
function foraDoHorario() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  const partes = {}
  for (const x of p) partes[x.type] = x.value
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(partes.weekday)
  const min = Number(partes.hour) * 60 + Number(partes.minute)
  if (dia === 0) return true // domingo
  if (dia === 6) return min < 8 * 60 || min >= 17 * 60 // sábado 08-17
  return min < 8 * 60 || min >= 19 * 60 // seg-sex 08-19
}

// Pergunta de produto óbvia (tem TIPO de peça conhecido: tela, manta, cabo...):
// pula a IA de classificação — economiza ~1-3s. Mensagem sem tipo (oi, obrigado,
// "iphone 11" solto) ainda passa pela IA pra decidir se é produto/compra/papo.
function ehProdutoLexico(texto) {
  return categoriasDe(texto).length > 0
}

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))

async function processaMensagem(sock, loja, jid, texto) {
  // jid pode vir como @lid (ID anônimo) — traduz pro número real antes de casar
  // com a tabela de preço do cliente.
  const telefone = resolveTelefone(jid) ?? jid.split('@')[0]
  const telefoneTruncado = telefone.slice(-4)
  // chave do "avisou hoje" é um hash do JID inteiro, não os últimos 4 dígitos: dois
  // clientes diferentes podem ter os mesmos 4 dígitos finais, e aí o segundo nunca
  // recebia o aviso obrigatório de "assistente automático". telefoneTruncado continua
  // servindo só pra exibição/log em registraTroca (não muda o schema do banco).
  const chaveAviso = createHash('sha256').update(jid).digest('hex').slice(0, 16)

  // Cliente do telefone (nome + tabela de preço). Resolvido UMA vez aqui em cima pra
  // servir tanto pro preço quanto pro alerta de pedido (nome no grupo).
  let cliente = await buscaTabelaDoCliente(telefone).catch(() => ({ id: null, nome: null, encontrado: false }))
  let nomeCliente = cliente.nome || resolveNome(jid) || null
  // Telefone não bateu (cliente chama de número fora do cadastro, ou @lid sem
  // resolução): tenta a tabela pelo NOME do WhatsApp — senão reseller cai no varejo.
  if (!cliente.encontrado && nomeCliente) {
    const porNome = await buscaTabelaPorNome(nomeCliente).catch(() => null)
    if (porNome && porNome.encontrado) {
      cliente = porNome
      nomeCliente = porNome.nome || nomeCliente
    }
  }

  // assunto fixo (chave PIX etc.) responde direto, sem passar pela IA de produto
  const fixo = await respondeAssuntoFixo(texto).catch(() => null)
  if (fixo) {
    await dorme(400 + Math.random() * 400)
    await sock.sendMessage(jid, { text: fixo })
    return
  }

  // Confirmação de pedido ("sim", "quero", "pode separar"...) vem ANTES de
  // resolver a lista — "Sim" é resposta a "quer que eu separe?", não seleção de
  // opção. Mandar "Sim" pro escolheProduto faz a IA chutar uma opção e a
  // confirmação se perde.
  const contexto = pegaContexto(loja.slug, jid)
  if (contexto && ehConfirmacao(texto)) {
    await respondePedido(sock, loja.slug, jid, telefone, contexto, nomeCliente)
    return
  }

  let produtos = await tentaResolverPendente(loja, jid, texto)
  let buscaDescricao = null

  if (!produtos) {
    let classificacao
    if (ehProdutoLexico(texto)) {
      // Tipo de peça óbvio: pula a IA de classificação (economiza ~1-3s).
      classificacao = { ehPerguntaProduto: true, textoBusca: texto, ehCompra: false }
    } else {
      try {
        const resumo = await resumoLoja().catch(() => '')
        classificacao = await classificaPergunta(texto, resumo)
      } catch (e) {
        console.error(`[${loja.slug}] [ERRO IA] falha ao classificar mensagem:`, e?.message || e)
        return // erro de IA nunca deve fazer o bot responder algo errado — só ignora
      }
    }
    if (classificacao.ehCompra) {
      await respondePedido(sock, loja.slug, jid, telefone, null, nomeCliente)
      return
    }
    if (!classificacao.ehPerguntaProduto) {
      // Mensagem fora do escopo de produto (oi, boa noite...): fora do expediente
      // responde o horário + que o robô segue 24h, em vez de ficar mudo.
      if (foraDoHorario()) {
        await dorme(400 + Math.random() * 400)
        await sock.sendMessage(jid, { text: FORA_HORARIO })
      }
      return
    }
    limpaContexto(loja.slug, jid) // pergunta nova de produto: contexto anterior ficou velho
    buscaDescricao = classificacao.textoBusca
    let sugestaoNota = null

    // "tem película?" / "tem capa?" sem aparelho: pergunta qual aparelho, não chuta.
    if (ehConsultaGenerica(buscaDescricao)) {
      await dorme(400 + Math.random() * 400)
      await sock.sendMessage(jid, { text: PERGUNTA_APARELHO })
      return
    }

    // Sem tipo de peça ("j7 amarelo" solto): a palavra-chave é o MODELO, cor é
    // detalhe. Prioridade do tipo: frontal (tela) > bateria > outros itens do
    // modelo. Continua o tipo da conversa anterior se já estava em "bateria" etc.
    let candidatos
    if (categoriasDe(buscaDescricao).length === 0) {
      // Marca solta ("iPhone", "Samsung", "telefone" sem modelo): pergunta o modelo,
      // não chuta frontal/bateria aleatória (erro visto em produção).
      if (ehMarcaSolta(buscaDescricao)) {
        await dorme(400 + Math.random() * 400)
        await sock.sendMessage(jid, { text: 'Me manda o modelo exato pra eu ver o preço (ex: iPhone 11, Moto G54). 😊' })
        return
      }
      const res = await buscaPorPrioridade(buscaDescricao, pegaCategoria(loja.slug, jid))
      candidatos = res.produtos
      if (res.categoria) guardaCategoria(loja.slug, jid, res.categoria)
    } else {
      const catAtual = categoriasDe(buscaDescricao)
      guardaCategoria(loja.slug, jid, catAtual[0])
      candidatos = await buscaProdutos(buscaDescricao)
    }
    // Busca estrita (AND) veio vazia: tenta de novo com rede mais larga (OR) e
    // deixa a IA decidir semanticamente — cobre "16 pro max oled" quando o
    // catálogo não tem a palavra "oled" no nome.
    let veioDaBuscaAmpla = candidatos.length === 0
    if (veioDaBuscaAmpla) candidatos = await buscaProdutosAmplo(buscaDescricao)

    // NÃO usa mais IA pra escolher a variação (escolheProduto): ela "adivinhava"
    // uma opção e escondia as outras de preço diferente ("vivid" → mostrava só a de
    // R$128 e sumia com a de R$65). Agora TODAS as variações sobem, e o cliente
    // escolhe por número/preço/palavra (resolveSelecao, determinístico). A busca
    // ampla já filtra o tipo certo via bateCategoria — a checagem de IA (nenhumServe)
    // tentava a mesma coisa e errava, então saiu.

    produtos = candidatos

    // Busca vazia: tenta alternativa (carcaça→tampa, botão→flex, combinação→peça
    // principal) em vez de responder "não encontrei" seco.
    if (produtos.length === 0 && buscaDescricao) {
      const alt = await buscaComAlternativa(buscaDescricao).catch(() => null)
      if (alt?.produtos.length) { produtos = alt.produtos; sugestaoNota = alt.nota }
    }

    // Muitas opções de MODELOS diferentes ("j7" casa Prime/Neo/Pro/Metal): em vez
    // de despejar 12 telas, pergunta qual modelo exato. Só quando são modelos
    // distintos — várias cores/telas do MESMO modelo continuam listando normal.
    if (produtos.length > LIMITE_OPCOES) {
      const modelos = modelosDistintos(produtos)
      if (modelos.length > 1) {
        // Guarda a lista de produtos E a lista de modelos — o cliente responde o
        // NÚMERO do modelo ("1" → primeiro), ou o nome ("11"/"pro"). Sem guardar,
        // "11" virava busca nova e o bot repetia a pergunta pra sempre.
        guardaPendente(loja.slug, jid, produtos)
        guardaModelos(loja.slug, jid, modelos)
        await dorme(400 + Math.random() * 400)
        const lista = modelos.slice(0, 6).map((m, i) => `${i + 1}. ${m.toUpperCase()}`).join('\n')
        await sock.sendMessage(jid, { text: `Achei vários modelos. Qual? (responda o número)\n${lista}` })
        return
      }
    }

  }

  // Preço pela TABELA do cliente (ATACADO1/ATACADO2...): quem tem tabela cadastrada
  // recebe o preço dela, não o varejo. Sem tabela = Preço Padrão.
  let tabelaId = cliente.id
  // Sem cadastro (telefone não bate) -> tabela VAREJO (cliente final). Cadastrado SEM
  // tabela -> continua no Preço Padrão (produtos.preco).
  if (!tabelaId && !cliente.encontrado) tabelaId = await buscaTabelaVarejoId().catch(() => null)
  if (tabelaId) {
    const precosTabela = await precosDaTabela(tabelaId, produtos.map((p) => p.id)).catch(() => new Map())
    if (precosTabela.size > 0) {
      produtos = produtos.map((p) => {
        const pt = precosTabela.get(p.id)
        return pt != null && pt > 0 ? { ...p, preco: pt } : p
      })
      // a busca ordenou pelo varejo; reordena pelo preço FINAL (tabela do cliente)
      produtos.sort((a, b) => (Number(a.preco) || 0) - (Number(b.preco) || 0))
    }
  }

  // Guarda a lista pendente DEPOIS do preço de tabela — o cliente escolhe pelo
  // número ("2") OU pelo valor ("a de 87"). Se guardasse antes, a lista ficaria com
  // o preço de varejo e a escolha "incell 87" não casava com a opção de R$ 87 da tabela.
  if (produtos.length > 1) guardaPendente(loja.slug, jid, produtos)

  // Guarda o produto oferecido como contexto — se o cliente responder "sim/quero",
  // vira pedido (confirma + alerta no grupo), não uma busca nova.
  if (produtos.length === 1) guardaContexto(loja.slug, jid, { nome: produtos[0].nome, preco: produtos[0].preco })

  const estoquePorId = new Map()
  await Promise.all(produtos.map(async (p) => {
    estoquePorId.set(p.id, await buscaEstoque(p.id, loja.depositoId))
  }))

  const comAviso = !jaAvisouHoje(loja.slug, chaveAviso)
  const itens = produtos.map((p) => ({ nome: p.nome, preco: p.preco, estoque: estoquePorId.get(p.id) ?? 0 }))
  let corpo
  if (produtos.length > 1) {
    // Lista determinística na MESMA ordem da pendência: a IA omitia "sem estoque"
    // e reordenava, então "1" resolvia pro produto errado. Aqui o número bate sempre.
    corpo = 'Temos essas opções:\n\n' + produtos.map((p, i) => (i + 1) + '. ' + p.nome + ' — ' + brl(p.preco) + ((estoquePorId.get(p.id) ?? 0) > 0 ? '' : ' (sem estoque)')).join('\n') + '\n\nMe responde só com o número da opção que você quer! 👍'
  } else {
    // Resposta natural via IA; se falhar, cai no template fixo (montaResposta)
    try {
      corpo = await geraResposta(texto, itens, LINK_ENCOMENDAS)
    } catch (e) {
      console.error(`[${loja.slug}] [ERRO IA] falha ao gerar resposta:`, e?.message || e)
      corpo = montaResposta({ produtos, estoquePorId, comAviso: false, linkEncomendas: LINK_ENCOMENDAS })
    }
  }
  const resposta = (sugestaoNota ? sugestaoNota + '\n\n' : '') + (comAviso ? AVISO + corpo : corpo)

  await dorme(400 + Math.random() * 400) // parece digitação humana, não resposta instantânea
  await sock.sendMessage(jid, { text: resposta })
  if (comAviso) marcaAvisoHoje(loja.slug, chaveAviso)

  registraTroca({
    loja: loja.slug,
    telefoneTruncado,
    pergunta: texto,
    produtoBuscado: buscaDescricao ?? produtos[0]?.nome ?? null,
    resultado: produtos.length === 1 ? 'respondido' : 'pediu_esclarecimento',
    resposta,
  })
}

