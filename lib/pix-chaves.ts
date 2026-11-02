// Chaves Pix que recebem comprovante no Telegram — apelido, nome fantasia, nome social
// e a chave em si. Pedido do dono em 01/11/2026.
// O comprovante NÃO traz a chave literal; o que a IA lê é nome + CNPJ do favorecido.
// Então o que identifica a conta aqui é a RAIZ do CNPJ (8 primeiros dígitos) e, quando
// a foto não trouxe CNPJ, o nome do favorecido.
// ATENÇÃO: este arquivo é só de EXIBIÇÃO. Nenhum cálculo de valor passa por aqui.

export type ChavePix = {
  apelido: string          // nome curto usado na planilha/mensagens
  fantasia: string         // nome fantasia / como o dono chama
  social: string           // nome social (razão social) que aparece no comprovante
  tipo: 'cnpj' | 'celular' | 'email' | 'outro' | 'sem-chave'
  chave: string            // chave Pix literal
  cnpjRaiz?: string        // 8 primeiros dígitos do CNPJ lido no comprovante
  obs?: string
}

export const CHAVES_PIX: ChavePix[] = [
  {
    apelido: 'H20',
    fantasia: 'Stor One',
    social: 'STOR ONE LTDA',
    tipo: 'cnpj',
    chave: '67.262.680/0001-92',
    cnpjRaiz: '67262680',
  },
  {
    apelido: 'ADL',
    fantasia: 'Armação Longitude',
    social: 'ARMAÇÃO LONGITUDE COMERCIO LTDA',
    tipo: 'celular',
    chave: '11959507410',
    cnpjRaiz: '64486787',
  },
  {
    apelido: 'INOVA',
    fantasia: 'Atrativa Acessórios',
    social: 'ATRATIVA ACESSÓRIOS PARA CELULARES EIRELI',
    tipo: 'email',
    chave: 'atrativaacessorioss@gmail.com',
    cnpjRaiz: '37010872',
  },
  {
    apelido: 'ZL',
    fantasia: 'ZL',
    social: 'FERNANDES DA SILVA REPRESENTAÇÃO COMERCIAL SJC LTDA (ou PLANORH PLANEJAMENTO E ORGANIZAÇÃO / FERREIRA E FERREIRA CONSULTORIA EMPRESARIAL EIRELI)',
    tipo: 'cnpj',
    chave: '17.966.582/0001-68',
    cnpjRaiz: '17966582',
    obs: 'Três favorecidos com o mesmo CNPJ. PLANORH e FERREIRA E FERREIRA caem aqui.',
  },
  {
    apelido: 'PLANETA',
    fantasia: 'Play Cell',
    social: 'PLAY CELL CELULARES',
    tipo: 'email',
    chave: 'planeta272026@outlook.com',
    cnpjRaiz: '03111659',
  },
  {
    apelido: 'PIX LOJA',
    fantasia: 'Pix da loja (Petrópolis)',
    social: '38.216.415 JOAO VITOR MAXIMIANO FRANCA',
    tipo: 'cnpj',
    chave: '38.216.415/0001-70',
    cnpjRaiz: '38216415',
    obs: 'Chave oficial da loja (PagBank) — é por ela que saem salário, aluguel e despesas. Aparece nos comprovantes dos DOIS grupos.',
  },
  {
    apelido: 'ISABELA',
    fantasia: 'Isabela Ponciano (dívida da loja em parcelas)',
    social: 'ISABELA PONCIANO CÂMARA',
    tipo: 'celular',
    chave: '16355285776',
    cnpjRaiz: '54870178',
    obs: 'Não é venda: dívida da loja paga em parcelas.',
  },
]

// Sem acento, maiúsculo, só A-Z0-9 e espaço — igual ao normNome do bot.
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s: string | null | undefined) => semAcento(String(s || '')).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

const APELIDO_POR_CNPJ: Record<string, string> = Object.fromEntries(
  CHAVES_PIX.filter((c) => c.cnpjRaiz).map((c) => [c.cnpjRaiz as string, c.apelido]),
)

// Quando a foto não trouxe CNPJ: o nome do favorecido decide.
const APELIDO_POR_NOME: [RegExp, string][] = [
  [/^STOR ONE\b/, 'H20'],
  [/^ARMACAO LONGITUDE\b/, 'ADL'],
  [/^ATRATIVA\b/, 'INOVA'],
  [/^FERNANDES DA SILVA\b/, 'ZL'],
  [/^PLANORH\b/, 'ZL'],
  [/^FERREIRA E FERREIRA\b/, 'ZL'],
  [/^PLAY CELL\b/, 'PLANETA'],
  [/^38 216 415 (JOAO VITOR|JOAO VICTOR) MAXIMIANO/, 'PIX LOJA'],
  [/^ISABELA PONCIANO\b/, 'ISABELA'],
]

/** Apelido da chave, ou null se essa conta não tem apelido configurado. */
export function apelidoDaChave(nome: string | null | undefined, cnpj?: string | null): string | null {
  const doc = String(cnpj || '').replace(/\D/g, '')
  if (doc.length >= 8) {
    const apelido = APELIDO_POR_CNPJ[doc.slice(0, 8)]
    if (apelido) return apelido
  }
  const n = norm(nome)
  if (n) for (const [re, apelido] of APELIDO_POR_NOME) if (re.test(n)) return apelido
  return null
}

/** Nome pra mostrar: apelido quando existe, senão o nome lido no comprovante. */
export function nomeDaChave(nome: string | null | undefined, cnpj?: string | null): string {
  return apelidoDaChave(nome, cnpj) || String(nome || '').trim() || 'SEM DESTINATÁRIO'
}

/** Chave completa (fantasia, social, chave) pelo apelido — pra relatório/tela. */
export function chavePorApelido(apelido: string): ChavePix | null {
  return CHAVES_PIX.find((c) => c.apelido === apelido) || null
}
