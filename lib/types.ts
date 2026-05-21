// ============================================================
// Tipos centrais do sistema TecnoCell
// ============================================================

export interface Deposito {
  id: string
  nome: string
  empresa_id: string | null
  empresa: string | null
}

export interface Categoria {
  hierarquia: string
  nome: string
  descricao: string | null
}

export interface Marca {
  nome: string
}

export interface Produto {
  id: string
  nome: string
  descricao: string | null
  preco: number
  preco_custo: number
  categoria: string | null
  marca: string | null
  ativo: boolean
  visivel_catalogo: boolean
  imagem_url: string | null
  codigo: string | null
  updated_at: string
}

export interface ProdutoComEstoque extends Produto {
  estoque: EstoqueItem[]
  estoque_total: number
  categoria_nome?: string
}

export interface EstoqueItem {
  id: string
  produto_id: string
  deposito_id: string
  quantidade: number
  updated_at: string
  deposito?: Deposito
  produto?: Produto
}

export interface Pessoa {
  id: string
  nome: string
  tipo: 'cliente' | 'fornecedor' | 'ambos'
  pessoa_fisica: boolean
  cpf_cnpj: string | null
  email: string | null
  telefone: string | null
  cidade: string | null
  estado: string | null
}

export interface Lancamento {
  id: string
  codigo: number
  descricao: string | null
  valor: number
  data_competencia: string
  data_vencimento: string
  data_pagamento: string | null
  tipo: 'pagar' | 'receber'
  status: string | null
  forma_pagamento: string | null
  pessoa_nome: string | null
}

export interface FormaPagamento {
  id: string
  nome: string
}

export interface Venda {
  id: string
  data: string
  total: number
  desconto: number
  forma_pagamento_id: string | null
  pessoa_id: string | null
  status: string
  observacoes: string | null
  created_at: string
}

export interface ItemVenda {
  id: string
  venda_id: string
  produto_id: string
  quantidade: number
  preco_unitario: number
  desconto_item: number
  total_item: number
}

// Contexto do chat IA
export interface ChatContext {
  tipo: 'funcionario' | 'cliente'
  totalProdutos?: number
  produtosEstoqueBaixo?: number
  resumoFinanceiro?: { aReceber: number; aPagar: number }
}
