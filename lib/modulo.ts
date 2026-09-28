// Cor por módulo — mesmo esquema do menu (Sidebar). O operador acha onde está.
export type Modulo = { nome: string; cor: string }

const PREFIXOS: { p: string; nome: string; cor: string }[] = [
  { p: '/painel/pdv', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/vendas', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/pedidos', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/devolucoes', nome: 'Vendas', cor: '#059669' },
  { p: '/painel/financeiro', nome: 'Financeiro', cor: '#d97706' },
  { p: '/painel/fiados', nome: 'Financeiro', cor: '#d97706' },
  { p: '/painel/contas', nome: 'Financeiro', cor: '#d97706' },
  { p: '/painel/produtos', nome: 'Estoque', cor: '#7c3aed' },
  { p: '/painel/estoque', nome: 'Estoque', cor: '#7c3aed' },
  { p: '/painel/compras', nome: 'Estoque', cor: '#7c3aed' },
  { p: '/painel/os', nome: 'Serviços', cor: '#F47920' },
  { p: '/painel/clientes', nome: 'Cadastros', cor: '#0891b2' },
  { p: '/painel/rh', nome: 'Equipe', cor: '#e11d48' },
  { p: '/painel/escala', nome: 'Equipe', cor: '#e11d48' },
  { p: '/painel/usuarios', nome: 'Admin', cor: '#e11d48' },
  { p: '/painel/relatorios', nome: 'Relatórios', cor: '#e11d48' },
  { p: '/painel/integracoes', nome: 'Integrações', cor: '#4f46e5' },
]

export function moduloAtual(pathname: string): Modulo | null {
  for (const m of PREFIXOS) if (pathname === m.p || pathname.startsWith(m.p + '/')) return { nome: m.nome, cor: m.cor }
  return null
}
