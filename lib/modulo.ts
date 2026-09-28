// Cor por módulo — mesmo esquema do menu (Sidebar). O operador acha onde está.
export type Modulo = { nome: string; cor: string }

// Ordem importa: a 1ª linha que casa vence. Prefixos específicos antes dos genéricos,
// e '/painel' (Dashboard) por ÚLTIMO, senão ele engole tudo.
const PREFIXOS: { p: string; nome: string; cor: string }[] = [
  // Geral (azul)
  { p: '/painel/meu-perfil', nome: 'Geral', cor: '#1B6CA8' },
  { p: '/painel/chat', nome: 'Geral', cor: '#1B6CA8' },
  // Vendas (verde)
  { p: '/painel/pdv', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/vendas', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/pedidos', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/entregas', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/devolucoes', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/painel-vendedor', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/metas', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/promocoes', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/tabelas-preco', nome: 'Vendas', cor: '#059669' },
  // Serviços (laranja)
  { p: '/painel/os', nome: 'Serviços', cor: '#F47920' },
  // Estoque (violeta)
  { p: '/painel/produtos', nome: 'Estoque', cor: '#7c3aed' },
  { p: '/painel/estoque', nome: 'Estoque', cor: '#7c3aed' },
  { p: '/painel/depositos', nome: 'Estoque', cor: '#7c3aed' },
  { p: '/painel/compras', nome: 'Estoque', cor: '#7c3aed' },
  // Financeiro (âmbar)
  { p: '/painel/financeiro', nome: 'Financeiro', cor: '#d97706' },
  { p: '/painel/fiados', nome: 'Financeiro', cor: '#d97706' },
  { p: '/painel/vales-credito', nome: 'Financeiro', cor: '#d97706' },
  { p: '/painel/contas', nome: 'Financeiro', cor: '#d97706' },
  // Cadastros (ciano)
  { p: '/painel/clientes', nome: 'Cadastros', cor: '#0891b2' },
  { p: '/painel/lojas', nome: 'Cadastros', cor: '#0891b2' },
  { p: '/painel/formas-pagamento', nome: 'Cadastros', cor: '#0891b2' },
  { p: '/painel/maquinas-cartao', nome: 'Cadastros', cor: '#0891b2' },
  { p: '/painel/categorias', nome: 'Cadastros', cor: '#0891b2' },
  { p: '/painel/marcas', nome: 'Cadastros', cor: '#0891b2' },
  // Integrações (índigo)
  { p: '/painel/integracoes', nome: 'Integrações', cor: '#4f46e5' },
  // Equipe / Admin (rosa) — RH e telas de quem gerencia
  { p: '/painel/rh', nome: 'Equipe', cor: '#e11d48' },
  { p: '/painel/escala', nome: 'Equipe', cor: '#e11d48' },
  { p: '/painel/motoboy', nome: 'Equipe', cor: '#e11d48' },
  { p: '/painel/freelancers', nome: 'Equipe', cor: '#e11d48' },
  { p: '/painel/lembretes', nome: 'Admin', cor: '#e11d48' },
  { p: '/painel/usuarios', nome: 'Admin', cor: '#e11d48' },
  { p: '/painel/cargos', nome: 'Admin', cor: '#e11d48' },
  { p: '/painel/configuracoes', nome: 'Admin', cor: '#e11d48' },
  { p: '/painel/relatorios', nome: 'Relatórios', cor: '#e11d48' },
  // Geral — Dashboard (por último: '/painel' casa com tudo que começa com '/painel/')
  { p: '/painel', nome: 'Geral', cor: '#1B6CA8' },
]

export function moduloAtual(pathname: string): Modulo | null {
  for (const m of PREFIXOS) if (pathname === m.p || pathname.startsWith(m.p + '/')) return { nome: m.nome, cor: m.cor }
  return null
}

