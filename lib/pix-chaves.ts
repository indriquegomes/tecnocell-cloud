// Chaves Pix que recebem comprovante no Telegram — nome fantasia, nome social, tipo e chave.
// Pedido do dono em 01/11/2026: NADA de apelido — aparece o nome fantasia.
// O comprovante NÃO traz a chave literal; o que a IA lê é nome + CNPJ do favorecido.
// Então o que identifica a conta aqui é a RAIZ do CNPJ (8 primeiros dígitos) e, quando
// a foto não trouxe CNPJ, o nome do favorecido.
// ATENÇÃO: este arquivo é só de EXIBIÇÃO. Nenhum cálculo de valor passa por aqui.

export type ChavePix = {
  fantasia: string         // nome fantasia — é o que aparece na planilha e no /fechar
  social: string           // nome social (razão social) que vem no comprovante
  tipo: 'cnpj' | 'celular' | 'email' | 'outro' | 'sem-chave'
  chave: string            // chave Pix literal
  cnpjRaiz?: string        // 8 primeiros dígitos do CNPJ lido no comprovante
  obs?: string
}

export const CHAVES_PIX: ChavePix[] = [
  {
    fantasia: 'H2O',
    social: 'STOR ONE LTDA',
    tipo: 'cnpj',
    chave: '67.262.680/0001-92',
    cnpjRaiz: '67262680',
  },
  {
    fantasia: 'Tecnocell Petrópolis',
    social: '38.216.415 JOAO VITOR MAXIMIANO FRANCA',
    tipo: 'cnpj',
    chave: '38.216.415/0001-70',
    cnpjRaiz: '38216415',
    obs: 'Chave oficial da loja (PagBank) — é por ela que saem salário, aluguel e despesas. Aparece nos comprovantes dos DOIS grupos.',
  },
  {
    fantasia: 'ADL',
    social: 'ARMAÇÃO LONGITUDE COMERCIO LTDA',
    tipo: 'celular',
    chave: '11959507410',
    cnpjRaiz: '64486787',
  },
  {
    fantasia: 'INOVA',
    social: 'ATRATIVA ACESSÓRIOS PARA CELULARES EIRELI',
    tipo: 'email',
    chave: 'atrativaacessorioss@gmail.com',
    cnpjRaiz: '37010872',
  },
  {
    fantasia: 'ZL',
    social: 'FERNANDES DA SILVA REPRESENTAÇÃO COMERCIAL SJC LTDA (ou PLANORH PLANEJAMENTO E ORGANIZAÇÃO / FERREIRA E FERREIRA CONSULTORIA EMPRESARIAL EIRELI)',
    tipo: 'cnpj',
    chave: '17.966.582/0001-68',
    cnpjRaiz: '17966582',
    obs: 'Três favorecidos com o mesmo CNPJ. PLANORH e FERREIRA E FERREIRA caem aqui.',
  },
  {
    fantasia: 'Isabela Ponciano',
    social: 'ISABELA PONCIANO CÂMARA',
    tipo: 'celular',
    chave: '24993117516',
    cnpjRaiz: '54870178',
    obs: 'Não é venda: dívida da loja paga em parcelas. É CLIENTE no cadastro.',
  },
  {
    fantasia: 'PLANETA',
    social: 'PLAY CELL CELULARES',
    tipo: 'email',
    chave: 'planeta272026@outlook.com',
    cnpjRaiz: '03111659',
  },
]

// Sem acento, maiúsculo, só A-Z0-9 e espaço — igual ao normNome do bot.
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s: string | null | undefined) => semAcento(String(s || '')).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

const FANTASIA_POR_CNPJ: Record<string, string> = Object.fromEntries(
  CHAVES_PIX.filter((c) => c.cnpjRaiz).map((c) => [c.cnpjRaiz as string, c.fantasia]),
)

// Quando a foto não trouxe CNPJ: o nome do favorecido decide.
const FANTASIA_POR_NOME: [RegExp, string][] = [
  [/^STOR ONE\b/, 'H2O'],
  [/^ARMACAO LONGITUDE\b/, 'ADL'],
  [/^ATRATIVA\b/, 'INOVA'],
  [/^FERNANDES DA SILVA\b/, 'ZL'],
  [/^PLANORH\b/, 'ZL'],
  [/^FERREIRA E FERREIRA\b/, 'ZL'],
  [/^PLAY CELL\b/, 'PLANETA'],
  [/^38 216 415 (JOAO VITOR|JOAO VICTOR) MAXIMIANO/, 'Tecnocell Petrópolis'],
  [/^ISABELA PONCIANO\b/, 'Isabela Ponciano'],
]

/** Nome fantasia da chave, ou null se essa conta não está cadastrada. */
export function fantasiaDaChave(nome: string | null | undefined, cnpj?: string | null): string | null {
  const doc = String(cnpj || '').replace(/\D/g, '')
  if (doc.length >= 8) {
    const fantasia = FANTASIA_POR_CNPJ[doc.slice(0, 8)]
    if (fantasia) return fantasia
  }
  const n = norm(nome)
  if (n) for (const [re, fantasia] of FANTASIA_POR_NOME) if (re.test(n)) return fantasia
  return null
}

/** Nome pra mostrar: nome fantasia quando cadastrado, senão o nome lido no comprovante. */
export function nomeDaChave(nome: string | null | undefined, cnpj?: string | null): string {
  return fantasiaDaChave(nome, cnpj) || String(nome || '').trim() || 'SEM DESTINATÁRIO'
}

/** Cadastro completo pelo nome fantasia. */
export function chavePorFantasia(fantasia: string): ChavePix | null {
  return CHAVES_PIX.find((c) => c.fantasia === fantasia) || null
}
