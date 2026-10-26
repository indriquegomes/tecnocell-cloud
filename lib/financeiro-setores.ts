// SETORES DO FINANCEIRO — uma classificação só, usada pelo filtro e pelo formulário.
//
// Antes existiam duas classificações que não conversavam: "Grupo" (Funcionários /
// Freelancers / Fornecedores / Contas fixas, cada um com uma regra diferente — um por
// nome de pessoa, outro por lista de categoria) e "Categoria" (uma lista plana em que
// Salários morava junto com Aluguel e Mercadoria). Escolher um não filtrava o outro, e
// a mesma despesa aparecia em caixas diferentes.
//
// Aqui cada categoria pertence a UM setor. O filtro em cascata e o formulário de
// lançamento leem daqui, então não nasce categoria fora do lugar.
//
// Este arquivo é só classificação: não escreve, não corrige e não apaga nada no banco.

export type Setor = {
  chave: string
  label: string
  emoji: string
  // Categorias do setor, com as grafias que já existem na base (o banco guarda
  // "Motoboy" e "motoboy" como coisas diferentes).
  categorias: string[]
  // Setor que não é por categoria: agrupa os lançamentos sem classificação nenhuma.
  semCategoria?: boolean
}

export const SETORES: Setor[] = [
  {
    chave: 'funcionarios',
    label: 'Funcionários',
    emoji: '👥',
    categorias: ['Salários', 'Bônus', 'Freelancer', 'Vale transporte', 'Vale Transporte'],
  },
  {
    chave: 'fornecedores',
    label: 'Fornecedores',
    emoji: '🏭',
    categorias: ['Mercadoria', 'Fornecedor / Mercadoria'],
  },
  {
    chave: 'estrutura',
    label: 'Estrutura da loja',
    emoji: '🏠',
    categorias: ['Aluguel', 'Energia/Luz', 'Contabilidade', 'Impostos'],
  },
  {
    chave: 'operacao',
    label: 'Operação do dia',
    emoji: '🛠️',
    categorias: ['Motoboy', 'motoboy', 'Combustível', 'Alimentação', 'Manutenção', 'Limpeza', 'Transporte', 'Perda', 'Uso interno', 'Serviços', 'Gastos em São Paulo', 'Saúde', 'Confraternização', 'Outras despesas', 'despesas loja'],
  },
  {
    chave: 'vendas',
    label: 'Vendas e entregas',
    emoji: '🧾',
    categorias: ['Combinado na entrega', 'Vale crédito usado', 'Estorno', 'Vendas'],
  },
  {
    chave: 'socio',
    label: 'Sócio e dívidas',
    emoji: '👤',
    categorias: ['Retirada do sócio', 'Dívida parcelada'],
  },
  {
    chave: 'sem_categoria',
    label: 'Sem categoria',
    emoji: '❓',
    categorias: [],
    semCategoria: true,
  },
]

export const categoriasDoSetor = (chave: string): string[] =>
  SETORES.find((s) => s.chave === chave)?.categorias ?? []

export const rotuloSetor = (chave: string): string => {
  const s = SETORES.find((x) => x.chave === chave)
  return s ? s.emoji + ' ' + s.label : chave
}

// Em qual setor cai uma categoria solta (comparação sem diferenciar maiúscula).
export function setorDaCategoria(categoria: string | null | undefined): Setor {
  const alvo = (categoria ?? '').trim().toLowerCase()
  if (!alvo) return SETORES[SETORES.length - 1]
  for (const s of SETORES) {
    if (s.categorias.some((c) => c.trim().toLowerCase() === alvo)) return s
  }
  return SETORES[SETORES.length - 1]
}

// Lista plana de todas as categorias conhecidas — usada nas sugestões do formulário.
export const TODAS_CATEGORIAS: string[] = SETORES.flatMap((s) => s.categorias)
