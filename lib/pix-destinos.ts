// PIX do dia agrupado por QUEM RECEBEU.
//
// O bot do Telegram já grava, em `comprovantes_pix`, quem pagou e quem recebeu
// cada comprovante. É daí que sai a conferência do dono:
//   cliente paga a chave do FORNECEDOR  → abate dívida de compra (não entra em conta)
//   cliente paga a chave da LOJA        → o dinheiro entra no banco e paga a folha
// Este arquivo só agrupa e casa com o cadastro — puro, sem banco, pra dar pra testar.

export type ItemPix = {
  valor: number | null
  destinatario: string | null
  /** CNPJ/CPF do destinatário quando o comprovante trouxe os 14 dígitos */
  doc?: string | null
  /** ID da transação (E2E) — é o que identifica o MESMO Pix reenviado */
  transacaoId?: string | null
  /** status que o bot gravou: extraido, data_divergente, duplicado, ilegivel, apagado… */
  status?: string | null
  /** quem pagou (comprovante) — usado só quando não veio o ID da transação */
  pagador?: string | null
  /** dia do Pix (AAAA-MM-DD) — idem */
  dia?: string | null
}

export type DestinoPix = {
  /** nome do destinatário, limpo (sem o CNPJ na frente) */
  nome: string
  /** 14 dígitos, quando algum comprovante do grupo trouxe o documento inteiro */
  doc: string | null
  comprovantes: number
  total: number
  /** soma dos comprovantes que trazem o valor ilegível (entram na contagem, não no total) */
  semValor: number
}

/**
 * O dinheiro caiu na CONTA da loja (banco) em vez de pagar fornecedor?
 * Compara com o CNPJ das lojas e com o titular/chave das contas cadastradas.
 * Sem documento no comprovante o CNPJ dos fornecedores costuma vir cortado
 * ("626800001"), então o nome do titular é a rede de segurança.
 */
export function ehContaPropria(
  destino: DestinoPix,
  documentosProprios: (string | null | undefined)[],
  nomesProprios: (string | null | undefined)[] = [],
): boolean {
  const docs = documentosProprios.map(soDigitos).filter((d) => d.length === 14 || d.length === 11)
  if (destino.doc && docs.includes(destino.doc)) return true
  // O titular cadastrado costuma vir com o CNPJ na frente
  // ("38.216.415 JOAO VITOR MAXIMIANO FRANCA") e o comprovante traz só o nome:
  // comparar sem tirar o documento da frente nunca casava.
  const alvo = semDocNaFrente(destino.nome)
  if (!alvo) return false
  return nomesProprios
    .map((x) => semDocNaFrente(x))
    .filter((x) => x.length >= 10)
    .some((x) => x === alvo || x.startsWith(alvo) || alvo.startsWith(x))
}

export function soDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

/** Maiúscula, sem acento e sem pontuação — "Stor One Ltda" e "STOR ONE LTDA" viram a mesma coisa. */
export function normNome(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "38.216.415 JOAO VITOR MAXIMIANO FRANCA" → "JOAO VITOR MAXIMIANO FRANCA". */
export function semDocNaFrente(v: unknown): string {
  const n = normNome(v)
  // dígitos (com espaço entre eles) colados na frente do nome — o CNPJ que o
  // comprovante imprime antes do nome do recebedor. 6+ caracteres evita comer
  // o "2" de um nome que começa com número.
  const limpo = n.replace(/^[\d ]{6,}(?=[A-Z])/, '').trim()
  return limpo || n
}

/**
 * Junta comprovantes do mesmo recebedor. Mesma regra do bot: mesmo nome
 * normalizado, ou mesmo CNPJ de 14 dígitos, ou um nome é começo do outro
 * ("ATOSCEL COMERCIO" × "ATOSCEL COMERCIO DE CELULARES").
 */
export function agruparPorDestino(itens: ItemPix[]): DestinoPix[] {
  const lista = (itens ?? []).filter((i) => i && (i.destinatario || i.doc))
  const n = lista.length
  const pai = lista.map((_, i) => i)
  const acha = (x: number): number => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x] } return x }
  const une = (a: number, b: number) => { const ra = acha(a), rb = acha(b); if (ra !== rb) pai[ra] = rb }

  const nomes = lista.map((i) => semDocNaFrente(i.destinatario ?? ''))
  const docs = lista.map((i) => { const d = soDigitos(i.doc); return d.length === 14 ? d : '' })

  const porNome: Record<string, number> = {}
  const porDoc: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    if (nomes[i]) { if (porNome[nomes[i]] != null) une(i, porNome[nomes[i]]); else porNome[nomes[i]] = i }
  }
  for (let i = 0; i < n; i++) {
    if (docs[i]) { if (porDoc[docs[i]] != null) une(i, porDoc[docs[i]]); else porDoc[docs[i]] = i }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nomes[i], b = nomes[j]
      if (!a || !b) continue
      if (a.length >= 10 && b.length >= 10 && (a.startsWith(b) || b.startsWith(a))) une(i, j)
    }
  }

  const baldes: Record<number, number[]> = {}
  for (let i = 0; i < n; i++) { const r = acha(i); (baldes[r] = baldes[r] || []).push(i) }

  const saida: DestinoPix[] = []
  for (const chave of Object.keys(baldes)) {
    const idx = baldes[Number(chave)]
    const cont: Record<string, number> = {}
    let total = 0
    let semValor = 0
    let doc: string | null = null
    for (const i of idx) {
      const nome = semDocNaFrente(lista[i].destinatario ?? '')
      if (nome) cont[nome] = (cont[nome] ?? 0) + 1
      const v = Number(lista[i].valor)
      if (Number.isFinite(v) && v > 0) total += v
      else semValor++
      if (!doc && docs[i]) doc = docs[i]
    }
    // nome mais repetido do grupo (o mesmo critério do bot) — é o que a
    // atendente reconhece no comprovante
    let nome = ''
    let melhor = -1
    for (const [k, c] of Object.entries(cont)) {
      const nota = c * 1000 + k.length
      if (nota > melhor) { melhor = nota; nome = k }
    }
    saida.push({
      nome: nome || 'SEM DESTINATÁRIO',
      doc,
      comprovantes: idx.length,
      total: Math.round(total * 100) / 100,
      semValor,
    })
  }
  return saida.sort((a, b) => b.total - a.total)
}

/**
 * Separa o que o bot leu do que NÃO pode virar dinheiro na conferência.
 * Erro humano é rotina no balcão: comprovante mandado duas vezes, foto que não
 * era comprovante, print ilegível, comprovante postado no grupo da outra loja.
 * Regra: cada um desses casos sai da conta e vai para um aviso — nunca some em
 * silêncio, e nunca conta duas vezes (dobrar o PIX do dia é o erro mais caro,
 * porque a atendente baixa dívida que não foi paga).
 */
export function separarComprovantes(
  itens: ItemPix[],
  opcoes: { transacoesDoOutroGrupo?: Set<string> | string[] } = {},
): {
  validos: ItemPix[]
  /** reenvio do mesmo Pix (mesmo ID de transação) ou linha que o bot marcou duplicada */
  repetidos: number
  valorRepetido: number
  /** foto que não era comprovante */
  naoComprovante: number
  /** a IA não conseguiu ler / ainda não leu: o valor não entra, o aviso sim */
  naoLidos: number
  /** leu o valor mas não dá pra saber quem recebeu */
  semDestino: number
  valorSemDestino: number
  /** mesmo Pix postado nos dois grupos: fica fora até alguém decidir de qual loja é */
  cruzados: ItemPix[]
  valorCruzado: number
  /** comprovante apagado do grupo — o app considera válido, mas avisa */
  apagados: number
} {
  const outroGrupo = new Set(
    [...(opcoes.transacoesDoOutroGrupo ?? [])].map((t) => String(t ?? '').trim()).filter(Boolean),
  )
  const vistos = new Set<string>()
  const r = {
    validos: [] as ItemPix[],
    repetidos: 0,
    valorRepetido: 0,
    naoComprovante: 0,
    naoLidos: 0,
    semDestino: 0,
    valorSemDestino: 0,
    cruzados: [] as ItemPix[],
    valorCruzado: 0,
    apagados: 0,
  }
  for (const it of itens ?? []) {
    const st = String(it.status ?? '').trim().toLowerCase()
    const valor = Number(it.valor)
    const temValor = Number.isFinite(valor) && valor > 0

    if (st === 'nao_comprovante' || st === 'furo') { r.naoComprovante++; continue }
    if (st === 'duplicado') { r.repetidos++; if (temValor) r.valorRepetido += valor; continue }

    // MESMO Pix reenviado: o ID da transação é a identidade do pagamento. O bot
    // novo marca 'duplicado', mas o antigo não marcava — 48 linhas de outubro
    // ficaram repetidas como 'extraido'. Deduplicar pelo ID cobre os dois.
    const tx = String(it.transacaoId ?? '').trim()
    if (tx) {
      if (vistos.has(tx)) { r.repetidos++; if (temValor) r.valorRepetido += valor; continue }
      vistos.add(tx)
      if (outroGrupo.has(tx)) {
        r.cruzados.push(it)
        if (temValor) r.valorCruzado += valor
        continue
      }
    } else if (temValor) {
      // Sem o ID (print cortado, PicPay): usa a mesma regra conservadora do bot —
      // só é repetido quando TUDO bate: recebedor + valor + dia + quem pagou.
      const nome = normNome(it.destinatario)
      const quem = normNome(it.pagador)
      const dia = String(it.dia ?? '').slice(0, 10)
      if (nome && quem && dia) {
        const chave = [nome, valor, dia, quem].join('|')
        if (vistos.has(chave)) { r.repetidos++; r.valorRepetido += valor; continue }
        vistos.add(chave)
      }
    }

    if (st === 'ilegivel' || st === 'recebido' || !temValor) { r.naoLidos++; continue }
    if (st === 'incompleto' || !String(it.destinatario ?? '').trim()) {
      r.semDestino++
      r.valorSemDestino += valor
      continue
    }
    if (st === 'apagado') r.apagados++
    r.validos.push(it)
  }
  const arred = (n: number) => Math.round(n * 100) / 100
  r.valorRepetido = arred(r.valorRepetido)
  r.valorSemDestino = arred(r.valorSemDestino)
  r.valorCruzado = arred(r.valorCruzado)
  return r
}

export type FornecedorRef = { id: string; nome: string; cpf_cnpj?: string | null; nome_fantasia?: string | null; chave_pix?: string | null }

/** Uma chave Pix a mais do cadastro (`pessoa_chaves_pix`): o mesmo fornecedor recebe por várias. */
export type ChavePixRef = { pessoa_id: string; chave: string; favorecido?: string | null }

/** O que ficou FORA da conta por erro humano — a tela mostra isso em avisos. */
export type PixAvisos = {
  repetidos: number
  valorRepetido: number
  naoComprovante: number
  naoLidos: number
  semDestino: number
  valorSemDestino: number
  cruzados: number
  valorCruzado: number
  apagados: number
  /** comprovantes de hoje que ficaram na sessão anterior deste caixa (caixa fechado no meio do dia) */
  daSessaoAnterior?: number
}

/** O destino já com o que a tela precisa: fornecedor casado, se é conta própria e quanto se deve. */
export type DestinoNaTela = DestinoPix & {
  fornecedorId: string | null
  fornecedorNome: string | null
  propria: boolean
  divida: number
}

/**
 * Acha o fornecedor do cadastro que corresponde ao destinatário.
 * Ordem: chave/documento cadastrado → nome do favorecido da chave → CNPJ do cadastro
 * → nome igual → nome é começo do outro.
 * Sem match devolve null (a tela mostra "não identificado" e o dono aponta uma vez).
 *
 * `chaves` são as chaves extras de `pessoa_chaves_pix`. O comprovante traz o nome do
 * FAVORECIDO da chave ("MAIS BARATO IMPORTAÇÃO E EXPORTAÇÃO LTDA"), que quase nunca é
 * o nome do cadastro ("ADL FORNECEDOR") — sem olhar o favorecido da chave, um PIX de
 * 3 mil para a mesma fornecedora aparecia como não identificado e a dívida não baixava.
 */
export function casarFornecedor(
  destino: DestinoPix,
  fornecedores: FornecedorRef[],
  chaves: ChavePixRef[] = [],
): FornecedorRef | null {
  const porId = new Map(fornecedores.map((f) => [f.id, f]))
  const daChave = (pessoaId: string) => porId.get(pessoaId) ?? null

  if (destino.doc) {
    const doc = destino.doc
    const chaveComDoc = chaves.find((c) => soDigitos(c.chave) === doc)
    if (chaveComDoc) { const f = daChave(chaveComDoc.pessoa_id); if (f) return f }
    const porDoc = fornecedores.find((f) => soDigitos(f.cpf_cnpj) === doc || soDigitos(f.chave_pix) === doc)
    if (porDoc) return porDoc
  }
  const alvo = normNome(destino.nome)
  if (!alvo) return null
  // nome que aparece no comprovante = nome do favorecido da chave
  const chaveComNome = chaves.find((c) => {
    const fav = normNome(c.favorecido)
    return fav.length >= 6 && (fav === alvo || fav.startsWith(alvo) || alvo.startsWith(fav))
  })
  if (chaveComNome) { const f = daChave(chaveComNome.pessoa_id); if (f) return f }
  const exato = fornecedores.find((f) => normNome(f.nome) === alvo || normNome(f.nome_fantasia) === alvo)
  if (exato) return exato
  if (alvo.length >= 10) {
    const prefixo = fornecedores.find((f) => {
      const a = normNome(f.nome), b = normNome(f.nome_fantasia)
      return [a, b].some((x) => x.length >= 10 && (x.startsWith(alvo) || alvo.startsWith(x)))
    })
    if (prefixo) return prefixo
  }
  return null
}
