// Comparação de nome usada nos cruzamentos do extrato.
//
// O extrato do PagBank trunca/estiliza o nome ("Marcos Vinicius Ferreira Da
// Conceicao" × "Marcos Vinicius Ferreira da Conceição") e às vezes bota o CNPJ na
// frente ("65.637.687 Marcos Vinicius Dias Pavao"). Sem tirar isso, o cruzamento
// por valor + data casa com a PESSOA ERRADA — foi o que aconteceu com o FABIANO
// DAS CHAGAS CHAVES (R$ 350,00), que casou com o R$ 350,00 pago à Letícia.
const PARTICULAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'])

export const normNome = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ')
  .replace(/^[\d ]{6,}(?=[A-Z])/, '')
  .replace(/\s+/g, ' ').trim()

export function mesmoNome(a, b) {
  const na = normNome(a), nb = normNome(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 8 && nb.length >= 8 && (na.startsWith(nb) || nb.startsWith(na))) return true
  const ta = na.split(' ').filter((t) => t.length >= 3 && !PARTICULAS.has(t))
  const tb = nb.split(' ').filter((t) => t.length >= 3 && !PARTICULAS.has(t))
  if (!ta.length || !tb.length) return false
  const comuns = ta.filter((t) => tb.includes(t)).length
  const menor = Math.min(ta.length, tb.length)
  if (menor === 1) {
    const comum = ta.find((t) => tb.includes(t))
    return !!comum && comum.length >= 4
  }
  return comuns >= 2
}

/** Nome do cliente da linha do app: pessoa_nome, senão a descrição sem o rótulo. */
export const nomeDoLancamento = (l) =>
  String(l.pessoa_nome ?? '').trim() || String(l.descricao ?? '').replace(/^(Devolu[çc][ãa]o|Estorno de cr[ée]dito)[^—–-]*[—–-]\s*/i, '').trim()

/**
 * Regra ESTRITA para ligar lançamento → cadastro.
 *
 * `mesmoNome` serve para comparar comprovante com descrição e é tolerante de
 * propósito. Para gravar `pessoa_id` não pode ser: "Vitor da Silva Costa" casou com
 * "VITOR JOSE SILVA DE SOUSA" (dois nomes em comum, pessoa errada).
 *
 * Aqui só vale quando o nome MENOR está inteiro dentro do maior, token por token:
 *   "ARTHUR DIAS" ⊂ "Arthur Dias Moura"            ✔
 *   "ANDERSON XAVIER" ⊂ "ANDERSON XAVIER DA ROCHA HENRIQUE" ✔
 *   "Vitor da Silva Costa" ⊄ "VITOR JOSE SILVA DE SOUSA"    ✗ (COSTA não está)
 *   "Lucar Gabriel Dias" ⊄ "LUCAS GABRIEL DIAS ..."         ✗ (LUCAR ≠ LUCAS)
 */
export function nomeContido(a, b) {
  const tokens = (s) => normNome(s).split(' ').filter((t) => t.length >= 3 && !PARTICULAS.has(t))
  const ta = tokens(a), tb = tokens(b)
  if (!ta.length || !tb.length) return false
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  if (menor.length === 1 && menor[0].length < 4) return false
  return menor.every((t) => maior.includes(t))
}