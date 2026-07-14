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
  '/painel/marcas':        'produtos',
  '/painel/tabelas-preco': 'produtos',
  '/painel/catalogo':      'produtos',
  '/painel/os':            'os',
  '/painel/relatorios':        'relatorios',
  '/painel/painel-vendedor':  'relatorios',
  '/painel/metas':            'metas',
  '/painel/rh':               'rh',
  '/painel/lembretes':        'lembretes',
  '/painel/compras':       'compras',
  '/painel/pedidos':       'pedidos',
  '/painel/usuarios':      'usuarios',
  '/painel/cargos':        'usuarios',
  '/painel/lojas':            'usuarios',
  '/painel/formas-pagamento': 'usuarios',
  '/painel/maquinas-cartao':  'usuarios',
  '/painel/configuracoes':    'usuarios',
  '/painel/vales-credito':    'financeiro',
  '/painel/contas':           'financeiro',
}

export const TODAS_PERMISSOES = [
  // Módulos — acesso à área
  { grupo: 'Módulos',  key: 'pdv',        label: 'PDV / Caixa',         desc: 'Acessar o ponto de venda e operação de caixa' },
  { grupo: 'Módulos',  key: 'vendas',     label: 'Vendas',               desc: 'Ver histórico de vendas' },
  { grupo: 'Módulos',  key: 'devolucoes', label: 'Devoluções',           desc: 'Registrar e consultar devoluções' },
  { grupo: 'Módulos',  key: 'os',         label: 'Ordens de Serviço',    desc: 'Assistência técnica e reparos' },
  { grupo: 'Módulos',  key: 'pedidos',    label: 'Pedidos',              desc: 'Orçamentos e pedidos de clientes' },
  { grupo: 'Módulos',  key: 'clientes',   label: 'Clientes',             desc: 'Ver e editar clientes e fornecedores' },
  { grupo: 'Módulos',  key: 'produtos',   label: 'Produtos',             desc: 'Catálogo, categorias e tabelas de preço' },
  { grupo: 'Módulos',  key: 'estoque',    label: 'Estoque',              desc: 'Movimentações e depósitos' },
  { grupo: 'Módulos',  key: 'compras',    label: 'Compras',              desc: 'Notas de entrada' },
  { grupo: 'Módulos',  key: 'financeiro', label: 'Financeiro',           desc: 'A receber, a pagar e lançamentos' },
  { grupo: 'Módulos',  key: 'relatorios', label: 'Relatórios',           desc: 'Relatórios gerenciais e indicadores' },
  { grupo: 'Módulos',  key: 'metas',      label: 'Metas',                desc: 'Configurar metas e faixas de premiação por loja' },
  { grupo: 'Módulos',  key: 'rh',         label: 'RH / Equipe',          desc: 'Espelho de ponto, horários e tarefas da equipe' },
  { grupo: 'Módulos',  key: 'lembretes',  label: 'Lembretes',            desc: 'Criar e editar as rotinas que o sistema cobra da equipe' },
  { grupo: 'Módulos',  key: 'usuarios',   label: 'Usuários',             desc: 'Gerenciar contas e permissões' },

  // Limites de operação — o que pode FAZER dentro do módulo (segurança de balcão)
  { grupo: 'Limites',  key: 'venda_desconto',   label: 'Dar desconto',            desc: 'Aplicar desconto na venda no PDV' },
  { grupo: 'Limites',  key: 'produto_custo',     label: 'Ver/editar custo',        desc: 'Ver e alterar o preço de custo dos produtos' },
  { grupo: 'Limites',  key: 'venda_abaixo_minimo', label: 'Vender abaixo do mínimo', desc: 'Fechar venda com preço abaixo do piso do produto' },
  { grupo: 'Limites',  key: 'crediario_receber', label: 'Receber crediário',       desc: 'Registrar pagamento de fiado' },
  { grupo: 'Limites',  key: 'credito_limite',    label: 'Alterar limite de crédito', desc: 'Mudar o limite de crédito das pessoas' },
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
