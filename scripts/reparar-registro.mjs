// Repara a tabela do registro.md que perdeu as barras "|" numa substituição anterior.
// Só formatação: o texto das células é preservado. Uso: node scripts/reparar-registro.mjs [--gravar]
import fs from 'node:fs'
const arq = 'docs/fechamento/2026-10/registro.md'
const GRAVAR = process.argv.includes('--gravar')
const linhas = fs.readFileSync(arq, 'utf8').split(/\r?\n/)
const CABECALHO = '| ID | Camada | App diz | Realidade diz | Diferença | Hipótese | Pergunta | Status |'
const SEPARADOR = '|---|---|---|---|---|---|---|---|'
const novas = []
let reparadas = 0, suspeitas = 0
for (const linha of linhas) {
  const cru = linha.trim()
  // linha de cabeçalho antiga
  if (/^ID\s{2,}Camada\s{2,}App diz/.test(cru)) { novas.push(CABECALHO); reparadas++; continue }
  if (/^-{2,}\s+-{2,}/.test(cru) && !cru.includes('|')) { novas.push(SEPARADOR); reparadas++; continue }
  // linha de item sem barra
  if (!linha.includes('|') && /^\s*INC-\d+\s{2,}/.test(linha)) {
    const cels = linha.trim().split(/\s{2,}/).map((c) => c.trim())
    if (cels.length === 8) { novas.push('| ' + cels.join(' | ') + ' |'); reparadas++; continue }
    // tenta 3+ espaços
    const cels3 = linha.trim().split(/\s{3,}/).map((c) => c.trim())
    if (cels3.length === 8) { novas.push('| ' + cels3.join(' | ') + ' |'); reparadas++; continue }
    suspeitas++
    console.log(`⚠ ${cels.length} células: ${cru.slice(0, 90)}`)
    novas.push(linha)
    continue
  }
  novas.push(linha)
}
console.log(`linhas reparadas: ${reparadas} · suspeitas: ${suspeitas}`)
const tabela = novas.filter((l) => /^\|\s*(INC-\d+|ID)/.test(l))
console.log(`linhas de tabela com barra: ${tabela.length}`)
for (const l of tabela.slice(0, 3)) console.log('  ' + l.slice(0, 130))
if (GRAVAR) { fs.writeFileSync(arq, novas.join('\n'), 'utf8'); console.log('gravado') }
else console.log('(dry-run)')
