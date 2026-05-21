export function validarCPF(cpf: string): boolean {
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(n[i]) * (10 - i)
  let r = (soma * 10) % 11
  if (r === 10 || r === 11) r = 0
  if (r !== parseInt(n[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(n[i]) * (11 - i)
  r = (soma * 10) % 11
  if (r === 10 || r === 11) r = 0
  return r === parseInt(n[10])
}

export function validarCNPJ(cnpj: string): boolean {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false
  const calc = (s: string, pesos: number[]) =>
    pesos.reduce((acc, p, i) => acc + parseInt(s[i]) * p, 0)
  const mod = (n: number) => { const r = n % 11; return r < 2 ? 0 : 11 - r }
  const d1 = mod(calc(n, [5,4,3,2,9,8,7,6,5,4,3,2]))
  const d2 = mod(calc(n, [6,5,4,3,2,9,8,7,6,5,4,3,2]))
  return d1 === parseInt(n[12]) && d2 === parseInt(n[13])
}

export function validarCpfCnpj(valor: string): { valido: boolean; tipo: 'cpf' | 'cnpj' | 'invalido' } {
  const n = valor.replace(/\D/g, '')
  if (n.length === 11) return { valido: validarCPF(n), tipo: 'cpf' }
  if (n.length === 14) return { valido: validarCNPJ(n), tipo: 'cnpj' }
  return { valido: false, tipo: 'invalido' }
}
