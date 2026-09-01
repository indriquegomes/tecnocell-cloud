// Formata um número como moeda brasileira (ex: 1234.5 → 'R$ 1.234,50').
export function formatBRL(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}
