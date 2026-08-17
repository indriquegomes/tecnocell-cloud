// Leitor mínimo de .xlsx.
//
// Por que não `exceljs` (que está instalado): ele trava indefinidamente nas
// exportações do SIGE. O arquivo de teste (32 produtos, 246 KB) tem três
// `externalLinks`, comentários e vmlDrawing; o exceljs passou de 2 minutos sem
// devolver nada. Este leitor faz o mesmo arquivo em segundos.
//
// ponytail: parse por regex no XML da planilha, não parser de XML completo.
// Aguenta o que o Excel e o SIGE geram. Se um dia aparecer arquivo que ele não
// leia, o caminho é trocar por um parser de verdade aqui dentro — a interface
// (`lerXlsx`) não muda.
import JSZip from 'jszip'

export type Planilha = {
  aba: string
  abas: string[]
  colunas: string[]
  linhas: Record<string, string>[]
}

// Célula que começa com =, +, - ou @ pode virar fórmula/comando ao reabrir no
// Excel (ataque de "injeção de fórmula" — o mesmo golpe conhecido de CSV).
// Aspas simples na frente força o Excel a tratar como texto puro.
export function celulaSegura(v: string): string {
  return /^[=+\-@]/.test(v) ? `'${v}` : v
}

/** Aplica celulaSegura em todo campo de texto de uma linha antes de exportar. */
export function linhaSegura<T extends Record<string, unknown>>(linha: T): T {
  const out = { ...linha }
  for (const k in out) {
    const v = out[k]
    if (typeof v === 'string') out[k] = celulaSegura(v) as T[Extract<keyof T, string>]
  }
  return out
}

// Desfaz celulaSegura() na leitura — senão baixar a planilha e reenviar sem
// mexer em nada aparece como "mudança" só por causa do apóstrofo de proteção.
export function desfazerCelulaSegura(v: string): string {
  return /^'[=+\-@]/.test(v) ? v.slice(1) : v
}

const decodar = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')

// "A" -> 1, "Z" -> 26, "AA" -> 27
function colParaIndice(letras: string): number {
  let n = 0
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

function indiceParaCol(n: number): string {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Nomes das abas na ordem das tabs, casados com o arquivo de cada uma. */
async function mapaDeAbas(zip: JSZip): Promise<{ nome: string; caminho: string }[]> {
  const wb = await zip.file('xl/workbook.xml')?.async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!wb || !rels) {
    // Sem metadados: cai pro sheet1, sheet2... em ordem numérica.
    return Object.keys(zip.files)
      .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
      .map((caminho, i) => ({ nome: `Planilha${i + 1}`, caminho }))
  }
  const alvoPorId = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    alvoPorId.set(m[1], m[2].replace(/^\/?(xl\/)?/, ''))
  }
  const out: { nome: string; caminho: string }[] = []
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const alvo = alvoPorId.get(m[2])
    if (alvo) out.push({ nome: decodar(m[1]), caminho: 'xl/' + alvo })
  }
  return out
}

/**
 * Lê uma aba do .xlsx. A linha 1 é o cabeçalho; cada linha vira um objeto
 * indexado pelo nome da coluna. Célula vazia vira string vazia.
 */
export async function lerXlsx(buffer: ArrayBuffer, nomeAba?: string): Promise<Planilha> {
  const zip = await JSZip.loadAsync(buffer)
  const abas = await mapaDeAbas(zip)
  if (abas.length === 0) throw new Error('planilha sem abas')

  const escolhida = (nomeAba && abas.find((a) => a.nome === nomeAba)) || abas[0]
  const xml = await zip.file(escolhida.caminho)?.async('string')
  if (!xml) throw new Error('aba nao encontrada no arquivo')

  // sharedStrings: cada <si> pode ter vários <t> (rich text) — concatena.
  const compartilhadas: string[] = []
  const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string')
  if (ssXml) {
    for (const si of ssXml.split('<si>').slice(1)) {
      compartilhadas.push(
        [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodar(m[1])).join('')
      )
    }
  }

  const celulasDaLinha = (corpo: string): Map<string, string> => {
    const out = new Map<string, string>()
    for (const c of corpo.matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]*)")?[^>]*>([\s\S]*?)<\/c>/g)) {
      const [, col, tipo, dentro] = c
      let valor = ''
      if (tipo === 'inlineStr') {
        valor = [...dentro.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodar(m[1])).join('')
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(dentro)
        if (v) valor = tipo === 's' ? (compartilhadas[Number(v[1])] ?? '') : decodar(v[1])
      }
      if (valor !== '') out.set(col, valor.trim())
    }
    return out
  }

  const linhasXml = [...xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)]
  if (linhasXml.length === 0) return { aba: escolhida.nome, abas: abas.map((a) => a.nome), colunas: [], linhas: [] }

  // Cabeçalho = primeira linha com pelo menos 2 células preenchidas.
  const iCabecalho = linhasXml.findIndex((l) => celulasDaLinha(l[2]).size >= 2)
  if (iCabecalho === -1) return { aba: escolhida.nome, abas: abas.map((a) => a.nome), colunas: [], linhas: [] }

  const cabecalho = celulasDaLinha(linhasXml[iCabecalho][2])
  const maxCol = Math.max(...[...cabecalho.keys()].map(colParaIndice))
  const colunas: string[] = []
  const nomePorCol = new Map<string, string>()
  for (let i = 1; i <= maxCol; i++) {
    const letra = indiceParaCol(i)
    const nome = cabecalho.get(letra) || `(coluna ${letra})`
    colunas.push(nome)
    nomePorCol.set(letra, nome)
  }

  const linhas: Record<string, string>[] = []
  for (const l of linhasXml.slice(iCabecalho + 1)) {
    const celulas = celulasDaLinha(l[2])
    if (celulas.size === 0) continue
    const obj: Record<string, string> = {}
    for (const nome of colunas) obj[nome] = ''
    for (const [letra, valor] of celulas) {
      const nome = nomePorCol.get(letra)
      if (nome) obj[nome] = valor
    }
    linhas.push(obj)
  }

  return { aba: escolhida.nome, abas: abas.map((a) => a.nome), colunas, linhas }
}
