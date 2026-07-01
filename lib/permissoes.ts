export const ROTAS_PERMISSAO: Record<string, string> = {
  '/painel/pdv':           'pdv',
  '/painel/vendas':        'vendas',
  '/painel/devolucoes':    'devolucoes',
  '/painel/financeiro':    'financeiro',
  '/painel/estoque':       'estoque',
  '/painel/estoque/transferencias': 'estoque',
  '/painel/depositos':     'estoque',
  '/painel/clientes':      'clientes',
  '/painel/produtos':      'produtos',
  '/painel/categorias':    'produtos',
  '/painel/tabelas-preco': 'produtos',
  '/painel/catalogo':      'produtos',
  '/painel/os':            'os',
  '/painel/relatorios':        'relatorios',
  '/painel/painel-vendedor':  'relatorios',
  '/painel/compras':       'compras',
  '/painel/pedidos':       'pedidos',
  '/painel/usuarios':      'usuarios',
  '/painel/empresas':         'usuarios',
  '/painel/lojas':            'usuarios',
  '/painel/formas-pagamento': 'usuarios',
  '/painel/configuracoes':    'usuarios',
  '/painel/vales-credito':    'financeiro',
}

export const TODAS_PERMISSOES = [
  { key: 'pdv',        label: 'PDV / Caixa',         desc: 'Acessar o ponto de venda e operação de caixa' },
  { key: 'vendas',     label: 'Vendas',               desc: 'Ver histórico de vendas' },
  { key: 'devolucoes', label: 'Devoluções',           desc: 'Registrar e consultar devoluções' },
  { key: 'os',         label: 'Ordens de Serviço',    desc: 'Assistência técnica e reparos' },
  { key: 'pedidos',    label: 'Pedidos',              desc: 'Orçamentos e pedidos de clientes' },
  { key: 'clientes',   label: 'Clientes',             desc: 'Ver e editar clientes e fornecedores' },
  { key: 'produtos',   label: 'Produtos',             desc: 'Catálogo, categorias e tabelas de preço' },
  { key: 'estoque',    label: 'Estoque',              desc: 'Movimentações e depósitos' },
  { key: 'compras',    label: 'Compras',              desc: 'Notas de entrada' },
  { key: 'financeiro', label: 'Financeiro',           desc: 'A receber, a pagar e lançamentos' },
  { key: 'relatorios', label: 'Relatórios',           desc: 'Relatórios gerenciais e indicadores' },
  { key: 'usuarios',   label: 'Usuários',             desc: 'Gerenciar contas e permissões' },
] as const

export type PermissaoKey = typeof TODAS_PERMISSOES[number]['key']

export function temPermissao(permissoes: string[], key: string, isMaster: boolean): boolean {
  if (isMaster) return true
  return permissoes.includes(key)
}

export function permissaoPorRota(pathname: string): string | null {
  const match = Object.entries(ROTAS_PERMISSAO)
    .find(([rota]) => pathname === rota || pathname.startsWith(rota + '/'))
  return match?.[1] ?? null
}
