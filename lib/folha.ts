// Cálculos de folha (CLT): FGTS, INSS, férias e 13º.
// INSS = tabela PROGRESSIVA por faixa (cada faixa paga a sua alíquota).
// Tabela 2025/2026 — se o governo mudar, troca aqui (ou vira config).

const TETO_INSS = 8157.41

const FAIXAS_INSS = [
  { ate: 1518.0, aliquota: 0.075 },
  { ate: 2793.88, aliquota: 0.09 },
  { ate: 4190.83, aliquota: 0.12 },
  { ate: TETO_INSS, aliquota: 0.14 },
]

export function calcINSS(salario: number): number {
  const s = Math.min(Math.max(0, salario), TETO_INSS)
  let total = 0
  let anterior = 0
  for (const f of FAIXAS_INSS) {
    if (s > f.ate) {
      total += (f.ate - anterior) * f.aliquota
      anterior = f.ate
    } else {
      total += (s - anterior) * f.aliquota
      return total
    }
  }
  return total
}

export const calcFGTS = (salario: number) => Math.max(0, salario) * 0.08
export const calcFerias = (salario: number) => Math.max(0, salario) / 12
export const calcDecimoTerceiro = (salario: number) => Math.max(0, salario) / 12

// Custo mensal CLT = salario + vale transporte + FGTS + INSS + férias (1/12) + 13º (1/12).
export function custoMensalCLT(salario: number, valeTransporte: number) {
  const fgts = calcFGTS(salario)
  const inss = calcINSS(salario)
  const ferias = calcFerias(salario)
  const decimoTerceiro = calcDecimoTerceiro(salario)
  const total = Math.max(0, salario) + Math.max(0, valeTransporte) + fgts + inss + ferias + decimoTerceiro
  return { fgts, inss, ferias, decimoTerceiro, total }
}
