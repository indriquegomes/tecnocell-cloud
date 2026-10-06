import { ehFeriadoNacional } from '@/lib/acesso'

// Último dia útil de um mês, em 'YYYY-MM-DD'.
// Dia útil = não é sábado, domingo, feriado nacional nem feriado extra
// (ex: feriado municipal/estadual da loja — passado como Set de 'YYYY-MM-DD').
export function ultimoDiaUtil(ano: number, mes: number, extras: Set<string> = new Set()): string {
  // dia 0 do mês seguinte = último dia do mês (Date.UTC trata mes como 1..12)
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  for (let dia = ultimo; dia >= 1; dia--) {
    const dow = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() // 0=dom, 6=sáb
    if (dow === 0 || dow === 6) continue
    if (ehFeriadoNacional(ano, mes, dia)) continue
    const iso = ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0')
    if (extras.has(iso)) continue
    return iso
  }
  // inalcançável na prática: todo mês tem ao menos 1 dia útil
  return ano + '-' + String(mes).padStart(2, '0') + '-01'
}

// Uma data 'YYYY-MM-DD' é o último dia útil do próprio mês?
export function ehUltimoDiaUtil(dataIso: string, extras: Set<string> = new Set()): boolean {
  const [a, m] = dataIso.split('-').map(Number)
  if (!a || !m) return false
  return ultimoDiaUtil(a, m, extras) === dataIso
}
