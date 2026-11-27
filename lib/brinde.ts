// Regra PURA do brinde "comprou tela, ganhou película do mesmo modelo".
//
// Usada nos DOIS lados: o servidor decide as opções que o vendedor vê e valida a
// escolha no F8. Se as duas pontas divergissem, o vendedor escolheria uma película
// e a venda recusaria — por isso a regra mora aqui, num lugar só.
//
// O casamento é por TEXTO do nome porque `produtos.modelo` está vazio em quase todo
// o catálogo (10 de 8.178 produtos).
//
// Como os nomes são escritos na vida real (lido do catálogo da loja):
//   "FRONTAL SAMSUNG A15 PREMIUM INCELL *ZL* COM ARO"
//   "PELICULA 3D IPHONE 6G/6S/7/8/SE 2020 BRANCA"
//   "FRONTAL INFINIX HOT 11S/X6812/X6815/HOT 20 PRO/SPARK 8 PRO ZLX6827"
// A barra lista VÁRIOS modelos na mesma peça ("esta película serve em 6G, 6S, 7, 8 e
// SE"). Por isso a comparação é feita em GRUPOS separados por barra: cada grupo é um
// aparelho, e a família do começo do nome (IPHONE, MOTOROLA, INFINIX…) vale para todos
// os grupos — é assim que "IPHONE 7" acha a película "IPHONE 6G/6S/7/8/SE 2020".
//
// Quatro travas que vieram de erro real:
//   • o NÚMERO do modelo precisa bater — "REDMI 13C" não serve em "REDMI 12C";
//   • precisa de palavra de família em comum — sem isso "IPAD PRO 11" casaria com
//     "IPHONE 11 PRO" só por ter 11 e PRO;
//   • variante muda o produto — "IPHONE 6S PLUS" não serve na película do "6S" (tela
//     maior), e isso é decidido DENTRO do grupo, não no nome inteiro;
//   • tela que já traz película no nome não gera brinde (seria película de graça).

const IGNORAR = new Set([
  'FRONTAL', 'TELA', 'DISPLAY', 'LCD', 'OLED', 'INCELL', 'TFT', 'PREMIUM', 'ORIGINAL',
  'NACIONAL', 'ZL', 'COM', 'SEM', 'ARO', 'PELICULA', 'PELICULAS', '3D', 'HIDROGEL',
  'CERAMICA', 'VIDRO', 'BORDA', 'NOVO', 'NOVA', 'UNIDADE', 'UN', 'COMBO', 'MODELO',
  'PARA', 'DE', 'DA', 'DO', 'E', 'Y', 'X', 'COR', 'CORES', 'RESISTENTE', 'ANTI', 'CHOQUE',
  'APLICACAO', 'KIT', 'COMPLETA', 'POLEGADAS', 'AAA', 'SOFT', 'VIVID', 'DIAMONDS',
  'RETIRADA', 'GENERICA', 'GENERICO', 'BRANCA', 'BRANCO', 'PRETA', 'PRETO',
])

const VARIANTES = new Set(['PRO', 'MAX', 'PLUS', 'ULTRA', 'MINI', 'LITE', 'SE', 'FE'])

function semAcento(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function tokenizar(trecho: string): string[] {
  return semAcento(trecho).toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length > 0 && !IGNORAR.has(w))
}

/** Palavras do nome que identificam o MODELO (usado também para filtrar no banco). */
export function palavrasModelo(nome: string): string[] {
  return tokenizar(nome)
}

/** Grupos de modelo: um por trecho separado por barra, com a família do começo do nome. */
export function gruposModelo(nome: string): string[][] {
  const trechos = semAcento(nome ?? '').split('/').map(tokenizar)
  const familia = (trechos[0] ?? []).filter((w) => !VARIANTES.has(w) && !/^\d+$/.test(w))
  return trechos
    .map((t) => {
      const extra = familia.filter((f) => !t.includes(f))
      return [...t, ...extra]
    })
    .filter((t) => t.length > 0)
}

/** A tela já vem com película no nome? Então não gera brinde. */
export function telaTrazPelicula(nome: string): boolean {
  return /PELICULA/.test(semAcento(nome).toUpperCase())
}

const variantes = (ws: string[]) => ws.filter((w) => VARIANTES.has(w)).sort().join('|')

/** Este grupo de película serve para este grupo de tela? */
function grupoCasa(gTela: string[], gPelicula: string[]): boolean {
  const setP = new Set(gPelicula)
  const comuns = gTela.filter((w) => setP.has(w))
  // Só a marca em comum não basta: precisa de pelo menos duas palavras...
  if (comuns.length < 2) return false
  // ...entre elas o número do modelo...
  if (!comuns.some((w) => /\d/.test(w))) return false
  // ...e uma palavra de família (MOTOROLA, IPHONE, G35, A15).
  if (!comuns.some((w) => !VARIANTES.has(w) && !/^\d+$/.test(w))) return false
  // Variante (PRO/MAX/PLUS/SE…) tem que ser a mesma dos dois lados.
  return variantes(gTela) === variantes(gPelicula)
}

/** Esta película serve para esta tela? (é a mesma regra que a venda aplica) */
export function peliculaServeParaTela(nomeTela: string, nomePelicula: string): boolean {
  if (telaTrazPelicula(nomeTela)) return false
  const telas = gruposModelo(nomeTela)
  const peliculas = gruposModelo(nomePelicula)
  for (const gt of telas) for (const gp of peliculas) if (grupoCasa(gt, gp)) return true
  return false
}

/** Quantas palavras de modelo os dois nomes têm em comum (só para ordenar as opções). */
export function pontuacaoModelo(nomeTela: string, nomePelicula: string): number {
  const telas = gruposModelo(nomeTela)
  const peliculas = gruposModelo(nomePelicula)
  let melhor = 0
  for (const gt of telas) for (const gp of peliculas) {
    const setP = new Set(gp)
    melhor = Math.max(melhor, gt.filter((w) => setP.has(w)).length)
  }
  return melhor
}

export function ehCategoriaTela(categoria?: string | null): boolean {
  const c = semAcento(categoria ?? '').toUpperCase()
  return c.includes('FRONTAL') || c.includes('TELA') || c.includes('DISPLAY')
}

/**
 * Esta linha do carrinho é uma TELA? Olha a categoria e, se ela não disser nada,
 * o começo do nome — todo frontal do catálogo é cadastrado como "FRONTAL ..." e
 * existem peças com categoria vazia/estranha. Sem a segunda checagem a tela some da
 * conta e a película de brinde cai na trava de custo ("não pode ser vendido pelo
 * preço de custo ou abaixo dele"), que é o que trava o balcão.
 */
export function ehTela(categoria?: string | null, nome?: string | null): boolean {
  if (ehCategoriaTela(categoria)) return true
  return /^(FRONTAL|TELA|DISPLAY|VIDRO)\b/.test(semAcento(nome ?? '').toUpperCase().trim())
}

export function ehCategoriaPelicula(categoria?: string | null): boolean {
  return semAcento(categoria ?? '').toUpperCase().includes('PELICULA')
}

/** Opção de brinde que o vendedor escolhe no carrinho. */
export interface BrindeOpcao {
  id: string
  nome: string
  codigo: string | null
  estoque: number
}

/** O que o carrinho pode ganhar hoje: película por tela e/ou o brinde único. */
export interface BrindesDoCarrinho {
  peliculas: {
    tela_id: string
    tela_nome: string
    opcoes: BrindeOpcao[]
    /** Existe película do modelo, mas nenhuma com estoque nesta loja. */
    semEstoque?: boolean
  }[]
  unico: { produto: BrindeOpcao; minimo: number; disponivel: boolean } | null
}
