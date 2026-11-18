// CLASSES DE NOTA DE ENTRADA — regra de qual peça pertence a qual família.
//
// Vive separado de `nota-leitura.ts` porque a TELA do importador também precisa
// disto (lista da classe e filtro do seletor de produto). Este arquivo não tem
// env, fetch nem nada de servidor: pode ser importado por componente de cliente.
//
// As famílias são a PRIMEIRA PALAVRA do nome no catálogo (e a categoria, quando
// bate) — é como o catálogo já está organizado: FRONTAL 1.150, TAMPA 980,
// FLEX 564, BATERIA 535, PLACA 357, PELICULA 331, GAVETA 325, LENTE 311…

export type ProdutoBasico = { id: string; nome: string; categoria?: string | null }

export const CLASSES_NOTA: { valor: string; label: string; familias: string[] }[] = [
  { valor: 'FRONTAL', label: 'Telas / frontais', familias: ['FRONTAL', 'LCD', 'TOUCH', 'ARO'] },
  { valor: 'BATERIA', label: 'Baterias', familias: ['BATERIA'] },
  { valor: 'PELICULA', label: 'Películas', familias: ['PELICULA'] },
  { valor: 'TAMPA', label: 'Tampas / gavetas / carcaça', familias: ['TAMPA', 'GAVETA', 'CARCAÇA', 'TRASEIRA'] },
  { valor: 'PLACA', label: 'Placas / conectores', familias: ['PLACA', 'CONECTOR'] },
  { valor: 'FLEX', label: 'Flex / botões', familias: ['FLEX', 'BOTAO'] },
  { valor: 'LENTE', label: 'Lentes / câmeras', familias: ['LENTE', 'CAMERA'] },
  { valor: 'ALTO', label: 'Alto-falantes', familias: ['ALTO'] },
  { valor: 'ACESSORIO', label: 'Acessórios (fone, cabo, carregador, case)', familias: ['FONE', 'CABO', 'CARREGADOR', 'CAIXA', 'CASE', 'CAPA'] },
]

/** O que a pessoa escreve na nota (ou escolhe na tela) → valor da classe. */
const PALAVRAS_CLASSE: { re: RegExp; valor: string }[] = [
  { re: /fronta|tela|lcd|touch/i, valor: 'FRONTAL' },
  { re: /bateria/i, valor: 'BATERIA' },
  { re: /pelicula|película|vidro/i, valor: 'PELICULA' },
  { re: /tampa|gaveta|carcaca|carcaça|traseira/i, valor: 'TAMPA' },
  { re: /placa|conector/i, valor: 'PLACA' },
  { re: /flex|botao|botão/i, valor: 'FLEX' },
  { re: /lente|camera|câmera/i, valor: 'LENTE' },
  { re: /alto\s*falante/i, valor: 'ALTO' },
  { re: /acessori|acessóri|fone|cabo|carregador|case|capa/i, valor: 'ACESSORIO' },
]

// Nome normalizado pra casar com o catálogo (mesma ideia de busca_norm).
export function normalizaNome(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Texto livre ("telas e frontais", "BATERIAS") → valor de classe (ou null). */
export function classeDoTexto(texto: string | null | undefined): string | null {
  const t = String(texto ?? '').trim()
  if (!t) return null
  const direto = CLASSES_NOTA.find((c) => c.valor === t.toUpperCase())
  if (direto) return direto.valor
  return PALAVRAS_CLASSE.find((p) => p.re.test(t))?.valor ?? null
}

/** Famílias de produto que entram numa classe (null = sem filtro). */
export function familiasDaClasse(classe: string | null | undefined): string[] | null {
  const c = classe ? (classeDoTexto(classe) ?? classe) : null
  if (!c) return null
  return CLASSES_NOTA.find((x) => x.valor === c)?.familias ?? null
}

/** A que famílias o produto pertence: 1ª palavra do nome + categoria. */
export function familiasDoProduto(p: ProdutoBasico): Set<string> {
  const out = new Set<string>()
  const nome = normalizaNome(p.nome)
  const primeira = nome.split(' ')[0]
  if (primeira) out.add(primeira)
  for (const parte of normalizaNome(p.categoria ?? '').split(' ')) {
    if (parte) out.add(parte)
  }
  if (nome.startsWith('ALTO FALANTE')) out.add('ALTO')
  return out
}

/** O produto entra nesta classe? (sem classe = tudo entra) */
export function produtoNaClasse(p: ProdutoBasico, classe: string | null | undefined): boolean {
  const familias = familiasDaClasse(classe)
  if (!familias) return true
  const doProduto = familiasDoProduto(p)
  return familias.some((f) => doProduto.has(f))
}
