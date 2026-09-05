export function incluiTexto(valor: unknown, busca: string) {
  return typeof valor === 'string' && valor.toLowerCase().includes(busca.toLowerCase())
}
