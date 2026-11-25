// Texto e agrupamento do monitoramento — sem dependência nenhuma, de propósito:
// é o pedaço que precisa rodar igual no navegador, no servidor e no teste
// (test/erros.test.ts). Quem grava no banco é lib/erros.ts.

const LIMITE_TEXTO = 400

// Documento e telefone aparecem FORMATADOS na mensagem de erro do banco
// ("duplicate key (cpf_cnpj)=(123.456.789-00)") e não em sequência corrida, por
// isso o `\d{6,}` sozinho não pegava. Estes três formatos brasileiros cobrem o
// que vaza de verdade; valor de dinheiro (1.299,00) fica legível de propósito,
// porque é o que identifica o caso.
const DOCUMENTOS: RegExp[] = [
  /\d{3}\.\d{3}\.\d{3}-\d{2}/g,            // CPF 123.456.789-00
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g,     // CNPJ 12.345.678/0001-90
  // Telefone: separador é obrigatório. Sem isso, o padrão de telefone casa o meio
  // de um IMEI (15 dígitos) e o mascaramento sai pela metade.
  /\(?\d{2}\)?\s?9?\d{4}[-\s]\d{4}/g,      // (24) 99999-8888
]

// Mensagem de banco vem com quebra de linha; mensagem de navegador vem gigante.
// Tudo que é identificador de pessoa sai como `···` antes de ir para o banco,
// para a tela e para o Telegram.
export function limparTexto(texto: string | null | undefined): string | null {
  if (!texto) return null
  // Sequência corrida primeiro: IMEI, cartão e telefone sem máscara saem inteiros
  // de uma vez, antes que um padrão formatado case pedaço no meio.
  let limpo = texto.replace(/\s+/g, ' ').replace(/\d{6,}/g, '···')
  for (const formato of DOCUMENTOS) limpo = limpo.replace(formato, '···')
  limpo = limpo.trim().slice(0, LIMITE_TEXTO)
  return limpo || null
}

// Hash determinístico (djb2) só para agrupar o mesmo problema repetido.
// ponytail: colisão entre dois títulos diferentes junta avisos, não perde erro —
// a linha continua salva com o título certo. Upgrade: sha1 se um dia incomodar.
export function agrupar(tela: string | null | undefined, titulo: string): string {
  const s = (tela ?? '') + '|' + titulo.toLowerCase()
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}
