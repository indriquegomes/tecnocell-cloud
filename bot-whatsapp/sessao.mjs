import { createHash } from 'node:crypto'
import path from 'node:path'
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { pino } from 'pino'
import qrcode from 'qrcode-terminal'
import QRCode from 'qrcode'
import { classificaPergunta, escolheProduto, geraResposta } from './lib/ia.mjs'
import { buscaProdutos, buscaProdutosAmplo, buscaEstoque, buscaChavePix, resumoLoja, ehConsultaGenerica, buscaTabelaDoCliente, buscaTabelaVarejoId, precosDaTabela, buscaTabelaPorNome } from './lib/produtos.mjs'
import { montaResposta, AVISO } from './lib/resposta.mjs'
import { ENDERECO, HORARIO, CADASTRO, POLITICA, ENCOMENDA, VENDEDORA, PERGUNTA_APARELHO } from './lib/info.mjs'
import { registraTroca, jaAvisouHoje, marcaAvisoHoje } from './lib/db.mjs'
import { guardaPendente, pegaPendente, limpaPendente, guardaContexto, pegaContexto, limpaContexto } from './lib/estado.mjs'
import { respondePedido, ehConfirmacao } from './lib/pedido.mjs'
import { aprendeContato, resolveTelefone, constroiMapa, resolveNome, aprendeNome } from './lib/lid-telefone.mjs'
import { dorme } from '../bot/lib/util.mjs'
import { env, RAIZ_REPO } from '../bot/lib/env.mjs'

const logger = pino({ level: 'silent' })
const LINK_ENCOMENDAS = env('BOT_WHATSAPP_LINK_ENCOMENDAS')

// 401 loggedOut, 403 forbidden (conta banida), 440 connectionReplaced (WhatsApp
// Web aberto em outro lugar) e 500 badSession não se resolvem tentando de novo —
// martelar reconexão numa conta já banida/deslogada só piora. Só reconecta em
// código transitório (408, 428, 503, 515, sem código, erro de rede).
const CODIGOS_DESCONEXAO_DEFINITIVA = new Set([401, 403, 440, 500])

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
  const { state, saveCreds } = await useMultiFileAuthState(pastaAuth)
  const { version } = await fetchLatestBaileysVersion()

  // syncFullHistory: true faz o Baileys sincronizar os CONTATOS na conexão — é daí
  // que vem o mapa lid->telefone (contacts.upsert traz { id, lid, jid }).
  const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false, syncFullHistory: true })
  sock.ev.on('creds.update', () => {
    saveCreds().catch((e) => console.error(`[${slug}] falha ao salvar credenciais:`, e))
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
      QRCode.toFile(path.join(RAIZ_REPO, 'bot-whatsapp', 'data', `qr_${slug}.png`), qr, { width: 512, margin: 2 })
        .then((destino) => console.log(`[${slug}] QR salvo em: ${destino}`))
        .catch(() => {})
    }
    if (connection === 'close') {
      if (fechando) return
      fechando = true
      sock.ev.removeAllListeners()

      const code = lastDisconnect?.error?.output?.statusCode
      const definitivo = CODIGOS_DESCONEXAO_DEFINITIVA.has(code)
      if (definitivo) {
        console.error(`[${slug}] conexão caiu (${code}). Sessão encerrada — precisa de ação humana: apague a pasta de auth e escaneie o QR de novo, ou verifique se a conta foi banida/aberta em outro lugar. Não vai reconectar sozinho.`)
      } else {
        console.error(`[${slug}] conexão caiu (${code || 'sem código'}). Reconectando em 5s...`)
        setTimeout(() => {
          iniciaSessao({ slug, depositoId, pastaAuth }).catch((e) => console.error(`[${slug}] falha ao reconectar:`, e))
        }, 5000)
      }
    } else if (connection === 'open') {
      console.log(`[${slug}] conectado ao WhatsApp.`)
      // constrói/atualiza o mapa lid->telefone em segundo plano (não bloqueia o bot)
      constroiMapa(sock).catch((e) => console.error(`[${slug}] falha ao construir mapa lid->telefone:`, e?.message || e))
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
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
}

// Tenta resolver a resposta do cliente contra a lista ambígua que o bot já
// ofereceu antes ("1", "a segunda", "o pro max"...). Número bate na hora, sem
// gastar chamada de IA; texto livre passa pela mesma escolheProduto() usada na
// busca nova. Devolve null se não conseguiu resolver — quem chama trata como
// pergunta nova (a lista pendente já foi limpa nesse caso, pra não interferir
// com o assunto novo).
async function tentaResolverPendente(loja, jid, texto) {
  const pendente = pegaPendente(loja.slug, jid)
  if (!pendente) return null

  const n = Number(texto.trim())
  if (Number.isInteger(n) && n >= 1 && n <= pendente.length) {
    // NÃO limpa: cliente pode ter errado o número e digitar outro logo depois.
    return [pendente[n - 1]]
  }

  const { indice } = await escolheProduto(texto, pendente).catch(() => ({ indice: null }))
  if (indice) {
    // também não limpa — mantém a lista pra cliente mudar de ideia
    return [pendente[indice - 1]]
  }

  limpaPendente(loja.slug, jid) // não resolveu — abandona a pendência, trata como assunto novo
  return null
}

// Assuntos fixos fora de preço/estoque (chave PIX, horário...). Devolve a resposta
// pronta ou null — null segue pro fluxo normal de produto.
async function respondeAssuntoFixo(texto) {
  const t = (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
  // política / entrega / garantia
  if (/(politica|regras|garantia|entrega|logistica|frete)/.test(t)) return POLITICA
  return null
}

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
    await dorme(1500 + Math.random() * 1500)
    await sock.sendMessage(jid, { text: fixo })
    return
  }

  let produtos = await tentaResolverPendente(loja, jid, texto)
  let buscaDescricao = null

  if (!produtos) {
    let classificacao
    try {
      const resumo = await resumoLoja().catch(() => '')
      classificacao = await classificaPergunta(texto, resumo)
    } catch (e) {
      console.error(`[${loja.slug}] [ERRO IA] falha ao classificar mensagem:`, e?.message || e)
      return // erro de IA nunca deve fazer o bot responder algo errado — só ignora
    }
    const contexto = pegaContexto(loja.slug, jid)
    if (classificacao.ehCompra || (contexto && ehConfirmacao(texto))) {
      await respondePedido(sock, loja.slug, jid, telefone, contexto, nomeCliente)
      return
    }
    if (!classificacao.ehPerguntaProduto) return // fora do escopo: sem log, sem resposta
    limpaContexto(loja.slug, jid) // pergunta nova de produto: contexto anterior ficou velho
    buscaDescricao = classificacao.textoBusca

    if (ehConsultaGenerica(buscaDescricao)) {
      await dorme(1500 + Math.random() * 1500)
      await sock.sendMessage(jid, { text: PERGUNTA_APARELHO })
      return
    }

    let candidatos = await buscaProdutos(classificacao.textoBusca)
    // Busca estrita (AND) veio vazia: tenta de novo com rede mais larga (OR) e
    // deixa a IA decidir semanticamente — cobre "16 pro max oled" quando o
    // catálogo não tem a palavra "oled" no nome.
    let veioDaBuscaAmpla = candidatos.length === 0
    if (veioDaBuscaAmpla) candidatos = await buscaProdutosAmplo(classificacao.textoBusca)

    // Busca estrita com 1 resultado: toda palavra do cliente bateu literalmente
    // no nome do produto, dá pra confiar sem gastar chamada de IA. Busca ampla
    // com 1 resultado NÃO tem essa garantia — ela pontua por palavra solta e
    // pode "ganhar" ignorando uma palavra que não bateu em nada (cliente digitou
    // "fro g24" abreviando "frontal", nenhum produto tem "fro", ela achou 1
    // tampa só pelo "g24" e respondeu como se "fro" nem existisse). Por isso
    // busca ampla sempre passa pela checagem de tipo, mesmo com 1 resultado só.
    if (candidatos.length > 1 || (veioDaBuscaAmpla && candidatos.length === 1)) {
      const { indice, nenhumServe } = await escolheProduto(texto, candidatos).catch(() => ({ indice: null, nenhumServe: false }))
      if (indice) candidatos = [candidatos[indice - 1]]
      else if (nenhumServe) candidatos = [] // achou só por bater no modelo/marca, não na peça pedida — não é opção de verdade
      else if (candidatos.length === 1) candidatos = [] // 1 candidato ampla, IA não confirmou nem descartou — não responde sem certeza
    }

    produtos = candidatos
    if (produtos.length > 1) guardaPendente(loja.slug, jid, produtos)
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
    }
  }

  // Guarda o produto oferecido como contexto — se o cliente responder "sim/quero",
  // vira pedido (confirma + alerta no grupo), não uma busca nova.
  if (produtos.length === 1) guardaContexto(loja.slug, jid, { nome: produtos[0].nome, preco: produtos[0].preco })

  const estoquePorId = new Map()
  await Promise.all(produtos.map(async (p) => {
    estoquePorId.set(p.id, await buscaEstoque(p.id, loja.depositoId))
  }))

  const comAviso = !jaAvisouHoje(loja.slug, chaveAviso)
  const itens = produtos.slice(0, 3).map((p) => ({ nome: p.nome, preco: p.preco, estoque: estoquePorId.get(p.id) ?? 0 }))
  // Resposta natural via IA; se falhar, cai no template fixo (montaResposta)
  let corpo
  try {
    corpo = await geraResposta(texto, itens, LINK_ENCOMENDAS)
  } catch (e) {
    console.error(`[${loja.slug}] [ERRO IA] falha ao gerar resposta:`, e?.message || e)
    corpo = montaResposta({ produtos, estoquePorId, comAviso: false, linkEncomendas: LINK_ENCOMENDAS })
  }
  const resposta = comAviso ? AVISO + corpo : corpo

  await dorme(2000 + Math.random() * 2000) // parece digitação humana, não resposta instantânea
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

