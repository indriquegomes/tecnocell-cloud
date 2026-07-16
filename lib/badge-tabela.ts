// Cor da tabela de preço do cliente — usada no PDV e na lista de Clientes.
//
// Vitor (16/07): a menina precisa VER que preço está pegando, sem abrir nada.
//   🟢 ATACADO 1 → preço melhor (R$4 na película) — clientes premium
//   🟠 ATACADO 2 → mais caro (R$19 na mesma película)
// Varejo e "sem tabela" não ganham destaque: é o caso normal, badge só faria ruído.
//
// Casa por NOME da tabela (não por id) porque os ids mudam entre ambientes e o
// nome é o que o Vitor mantém ("ATACADO1", "ATACADO2").
export function badgeTabela(
  id: string | null | undefined,
  tabelas: { id: string; nome: string }[] = [],
): { txt: string; cls: string } | null {
  if (!id) return null
  const nome = tabelas.find((t) => t.id === id)?.nome ?? ''
  if (!nome) return null
  if (/atacado\s*1/i.test(nome)) return { txt: '🟢 ATACADO 1', cls: 'bg-green-100 text-green-800' }
  if (/atacado\s*2/i.test(nome)) return { txt: '🟠 ATACADO 2', cls: 'bg-orange-100 text-orange-800' }
  if (/varejo/i.test(nome))      return null
  return { txt: nome.toUpperCase().slice(0, 18), cls: 'bg-blue-50 text-blue-700' }
}
