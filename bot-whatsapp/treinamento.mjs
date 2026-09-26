// 50 exemplos reais de mensagem de cliente → classificação esperada.
// Fonte única de "treinamento" da IA de atendimento (classificaPergunta).
// Rode node bot-whatsapp/testa-ia.mjs pra medir a acurácia contra a DeepSeek.
//
// Campos:
//   texto                 — mensagem do cliente (nas palavras dele)
//   eh_pergunta_produto   — pede preço/disponibilidade de produto? (boolean)
//   texto_busca           — o que o bot deveria procurar no catálogo (null se não é produto)
//   eh_compra             — o cliente já decidiu fechar agora? (boolean)
//   grupo                 — só pra leitura: produto | compra | fora-de-produto

export const TREINAMENTO = [
  // ---------- 25 perguntas de produto (preço/disponibilidade) ----------
  { texto: 'quanto custa a tela do iphone 12?', eh_pergunta_produto: true, texto_busca: 'tela iphone 12', eh_compra: false, grupo: 'produto' },
  { texto: 'vcs tem bateria pra moto g54', eh_pergunta_produto: true, texto_busca: 'bateria moto g54', eh_compra: false, grupo: 'produto' },
  { texto: 'qual o valor da capinha do redmi note 12', eh_pergunta_produto: true, texto_busca: 'capinha redmi note 12', eh_compra: false, grupo: 'produto' },
  { texto: 'tela do iphone 11', eh_pergunta_produto: true, texto_busca: 'tela iphone 11', eh_compra: false, grupo: 'produto' },
  { texto: 'frontal iphone 12', eh_pergunta_produto: true, texto_busca: 'frontal iphone 12', eh_compra: false, grupo: 'produto' },
  { texto: 'tampa redmi 8 pro', eh_pergunta_produto: true, texto_busca: 'tampa redmi 8 pro', eh_compra: false, grupo: 'produto' },
  { texto: 'cabo tipo c', eh_pergunta_produto: true, texto_busca: 'cabo tipo c', eh_compra: false, grupo: 'produto' },
  { texto: 'bateria do s20', eh_pergunta_produto: true, texto_busca: 'bateria s20', eh_compra: false, grupo: 'produto' },
  { texto: 'conector de carga do a32', eh_pergunta_produto: true, texto_busca: 'conector carga a32', eh_compra: false, grupo: 'produto' },
  { texto: 'pelicula do moto g84', eh_pergunta_produto: true, texto_busca: 'pelicula moto g84', eh_compra: false, grupo: 'produto' },
  { texto: 'tem a tela do a15?', eh_pergunta_produto: true, texto_busca: 'tela a15', eh_compra: false, grupo: 'produto' },
  { texto: 'quanto ta o frontal do j7 prime', eh_pergunta_produto: true, texto_busca: 'frontal j7 prime', eh_compra: false, grupo: 'produto' },
  { texto: 'essa tela serve no iphone 11 pro max?', eh_pergunta_produto: true, texto_busca: 'tela iphone 11 pro max', eh_compra: false, grupo: 'produto' },
  { texto: 'tem tampa traseira do redmi note 13?', eh_pergunta_produto: true, texto_busca: 'tampa traseira redmi note 13', eh_compra: false, grupo: 'produto' },
  { texto: 'carcaça do a54', eh_pergunta_produto: true, texto_busca: 'carcaça a54', eh_compra: false, grupo: 'produto' },
  { texto: 'bateria pra iphone 8 plus', eh_pergunta_produto: true, texto_busca: 'bateria iphone 8 plus', eh_compra: false, grupo: 'produto' },
  { texto: 'carregador turbo pra samsung', eh_pergunta_produto: true, texto_busca: 'carregador turbo samsung', eh_compra: false, grupo: 'produto' },
  { texto: 'fone bluetooth tem?', eh_pergunta_produto: true, texto_busca: 'fone bluetooth', eh_compra: false, grupo: 'produto' },
  { texto: 'flex de carga do moto g22', eh_pergunta_produto: true, texto_busca: 'flex carga moto g22', eh_compra: false, grupo: 'produto' },
  { texto: 'pelicula 3d do iphone 13', eh_pergunta_produto: true, texto_busca: 'pelicula 3d iphone 13', eh_compra: false, grupo: 'produto' },
  { texto: 'tem capinha pro iphone 15', eh_pergunta_produto: true, texto_busca: 'capinha iphone 15', eh_compra: false, grupo: 'produto' },
  { texto: 'qual o valor da bateria original do s23', eh_pergunta_produto: true, texto_busca: 'bateria original s23', eh_compra: false, grupo: 'produto' },
  { texto: 'frontal do a71', eh_pergunta_produto: true, texto_busca: 'frontal a71', eh_compra: false, grupo: 'produto' },
  { texto: 'tem tela do moto g9 play', eh_pergunta_produto: true, texto_busca: 'tela moto g9 play', eh_compra: false, grupo: 'produto' },
  { texto: 'quanto custa o display do redmi 9', eh_pergunta_produto: true, texto_busca: 'display redmi 9', eh_compra: false, grupo: 'produto' },

  // ---------- 10 intenções de compra (já quer fechar) ----------
  { texto: 'quero 1', eh_pergunta_produto: false, texto_busca: null, eh_compra: true, grupo: 'compra' },
  { texto: 'me ve uma', eh_pergunta_produto: false, texto_busca: null, eh_compra: true, grupo: 'compra' },
  { texto: 'vou levar', eh_pergunta_produto: false, texto_busca: null, eh_compra: true, grupo: 'compra' },
  { texto: 'quero comprar essa', eh_pergunta_produto: false, texto_busca: null, eh_compra: true, grupo: 'compra' },
  { texto: 'fecha pra mim', eh_pergunta_produto: false, texto_busca: null, eh_compra: true, grupo: 'compra' },
  { texto: 'pode separar', eh_pergunta_produto: false, texto_busca: null, eh_compra: true, grupo: 'compra' },
  { texto: 'me vende essa bateria', eh_pergunta_produto: false, texto_busca: null, eh_compra: true, grupo: 'compra' },
  { texto: 'quero 2 telas do iphone 12', eh_pergunta_produto: false, texto_busca: null, eh_compra: true, grupo: 'compra' },
  { texto: 'manda uma tela do iphone 12', eh_pergunta_produto: false, texto_busca: null, eh_compra: true, grupo: 'compra' },
  { texto: 'pode embrulhar que eu vou levar', eh_pergunta_produto: false, texto_busca: null, eh_compra: true, grupo: 'compra' },

  // ---------- 15 fora do escopo de produto (reclamação, status, política...) ----------
  { texto: 'a bateria não veio', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'a tela veio quebrada', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'cadê meu pedido', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'já mandou as telas', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'vcs abrem que horas?', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'onde fica a loja?', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'oi', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'boa noite', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'meu celular caiu na agua, conserta?', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'tem garantia?', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'parcela no cartão?', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'vende fiado?', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'qual o valor do frete?', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'o valor ta salgado, da pra fazer desconto?', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
  { texto: 'chegou a encomenda que eu pedi?', eh_pergunta_produto: false, texto_busca: null, eh_compra: false, grupo: 'fora-de-produto' },
]

export const TOTAL = TREINAMENTO.length