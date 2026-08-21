'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { SVGProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { temPermissao } from '@/lib/permissoes'
import {
  IconDashboard, IconUser, IconCart, IconCalculator, IconChart, IconClipboard,
  IconReturn, IconTarget, IconTag, IconWrench, IconPackage, IconSwap, IconBank,
  IconFile, IconWallet, IconCard, IconUsers, IconShield, IconSettings, IconStore, IconIntegracao,
} from '@/components/icons'

type IconComp = (p: SVGProps<SVGSVGElement>) => ReactNode
const ICONS: Record<string, IconComp> = {
  '/painel': IconDashboard,
  '/painel/meu-perfil': IconUser,
  '/painel/pdv': IconCart,
  '/painel/pdv/operacao': IconCalculator,
  '/painel/vendas': IconChart,
  '/painel/pedidos': IconClipboard,
  '/painel/devolucoes': IconReturn,
  '/painel/painel-vendedor': IconChart,
  '/painel/metas': IconTarget,
  '/painel/promocoes': IconTag,
  '/painel/tabelas-preco': IconTag,
  '/painel/os': IconWrench,
  '/painel/produtos': IconPackage,
  '/painel/estoque': IconPackage,
  '/painel/estoque/historico': IconSwap,
  '/painel/depositos': IconBank,
  '/painel/compras': IconFile,
  '/painel/financeiro': IconWallet,
  '/painel/fiados': IconCard,
  '/painel/vales-credito': IconCard,
  '/painel/contas': IconBank,
  '/painel/clientes': IconUsers,
  '/painel/lojas': IconStore,
  '/painel/formas-pagamento': IconCard,
  '/painel/maquinas-cartao': IconCard,
  '/painel/categorias': IconTag,
  '/painel/marcas': IconTag,
  '/painel/relatorios': IconChart,
  '/painel/rh': IconUsers,
  '/painel/escala': IconUsers,
  '/painel/lembretes': IconUsers,
  '/painel/usuarios': IconUser,
  '/painel/cargos': IconShield,
  '/painel/configuracoes': IconSettings,
  '/painel/componentes': IconSettings,
  '/painel/integracoes':                IconIntegracao,
  '/painel/integracoes/lojas':          IconStore,
  '/painel/integracoes/produtos':       IconPackage,
  '/painel/integracoes/pedidos':        IconClipboard,
  '/painel/integracoes/sincronizacoes': IconSwap,
  '/painel/integracoes/mensagens':      IconFile,
  '/painel/integracoes/financeiras':    IconWallet,
  '/painel/integracoes/expedicao':      IconSwap,
  '/painel/integracoes/drop-shipping':  IconPackage,
  '/painel/integracoes/mercado-livre/perguntas': IconFile,
  '/painel/integracoes/mercado-livre/mensagens': IconFile,
}

type NavItem = { href: string; label: string; permissao?: string }
type NavGroup = { group: string; items: NavItem[] }

const navCompleto: NavGroup[] = [
  {
    group: 'Geral',
    items: [
      { href: '/painel', label: 'Dashboard' },
      { href: '/painel/meu-perfil', label: 'Meu Perfil' },
      { href: '/painel/chat', label: 'Chat com IA', permissao: 'chat_ia' },
    ],
  },
  {
    group: 'Vendas',
    items: [
      { href: '/painel/pdv',            label: 'PDV / Caixa',           permissao: 'pdv' },
      { href: '/painel/pdv/operacao',   label: 'Operação do PDV',       permissao: 'pdv' },
      { href: '/painel/vendas',         label: 'Painel de Vendas',      permissao: 'vendas' },
      { href: '/painel/pedidos',        label: 'Pedidos e Orçamentos',  permissao: 'pedidos' },
      { href: '/painel/devolucoes',     label: 'Devoluções',            permissao: 'devolucoes' },
      { href: '/painel/painel-vendedor', label: 'Painel Vendedor',      permissao: 'relatorios' },
      { href: '/painel/metas',          label: 'Metas',                 permissao: 'metas' },
      { href: '/painel/promocoes',      label: 'Promoções',             permissao: 'produtos' },
      { href: '/painel/tabelas-preco',  label: 'Tabelas de Preço',      permissao: 'produtos' },
    ],
  },
  {
    group: 'Serviços',
    items: [
      { href: '/painel/os', label: 'Ordens de Serviço', permissao: 'os' },
      { href: '/painel/os/checklists', label: 'Check-lists', permissao: 'os' },
    ],
  },
  {
    group: 'Estoque',
    items: [
      { href: '/painel/produtos',          label: 'Produtos',       permissao: 'produtos' },
      { href: '/painel/produtos/importar', label: 'Importar Itens', permissao: 'produtos' },
      { href: '/painel/estoque',           label: 'Estoque',        permissao: 'estoque' },
      { href: '/painel/estoque/historico', label: 'Movimentações',  permissao: 'estoque' },
      { href: '/painel/depositos',         label: 'Depósitos',      permissao: 'estoque' },
      { href: '/painel/compras',           label: 'Notas de Entrada', permissao: 'compras' },
    ],
  },
  {
    group: 'Financeiro',
    items: [
      { href: '/painel/financeiro',    label: 'Financeiro',           permissao: 'financeiro' },
      { href: '/painel/fiados',        label: 'Fiados',               permissao: 'financeiro' },
      { href: '/painel/vales-credito', label: 'Créditos de Clientes', permissao: 'financeiro' },
      { href: '/painel/contas',        label: 'Contas',               permissao: 'financeiro' },
    ],
  },
  {
    group: 'Cadastros',
    items: [
      { href: '/painel/clientes',         label: 'Pessoas',             permissao: 'clientes' },
      { href: '/painel/clientes/importar', label: 'Importar Clientes',  permissao: 'clientes' },
      { href: '/painel/lojas',            label: 'Lojas',               permissao: 'usuarios' },
      { href: '/painel/formas-pagamento', label: 'Formas de Pagamento', permissao: 'usuarios' },
      { href: '/painel/maquinas-cartao',  label: 'Máquinas de Cartão',   permissao: 'usuarios' },
      { href: '/painel/categorias',       label: 'Categorias',          permissao: 'produtos' },
      { href: '/painel/marcas',           label: 'Marcas',              permissao: 'produtos' },
    ],
  },
  {
    group: 'Integrações',
    items: [
      { href: '/painel/integracoes',                label: 'Dashboard',                permissao: 'integracoes' },
      { href: '/painel/integracoes/lojas',           label: 'Minhas Lojas',             permissao: 'integracoes' },
      { href: '/painel/integracoes/mercado-livre/perguntas', label: 'Perguntas ML', permissao: 'integracoes' },
      { href: '/painel/integracoes/mercado-livre/mensagens', label: 'Mensagens ML', permissao: 'integracoes' },
      { href: '/painel/integracoes/produtos',        label: 'Meus Produtos',            permissao: 'integracoes' },
      { href: '/painel/integracoes/pedidos',         label: 'Meus Pedidos',             permissao: 'integracoes' },
      { href: '/painel/integracoes/sincronizacoes',  label: 'Sincronizações Pendentes', permissao: 'integracoes' },
      { href: '/painel/integracoes/mensagens',       label: 'Mensagens Automáticas',    permissao: 'integracoes' },
      { href: '/painel/integracoes/financeiras',     label: 'Financeiras',              permissao: 'integracoes' },
      { href: '/painel/integracoes/expedicao',       label: 'Expedição',                permissao: 'integracoes' },
      { href: '/painel/integracoes/drop-shipping',   label: 'Drop Shipping',            permissao: 'integracoes' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { href: '/painel/relatorios',    label: 'Relatórios',    permissao: 'relatorios' },
      { href: '/painel/rh',            label: 'RH / Equipe',   permissao: 'rh' },
      { href: '/painel/escala',        label: 'Escala',        permissao: 'rh' },
      { href: '/painel/lembretes',     label: 'Lembretes',     permissao: 'lembretes' },
      { href: '/painel/usuarios',      label: 'Usuários',      permissao: 'usuarios' },
      { href: '/painel/cargos',        label: 'Cargos',        permissao: 'usuarios' },
      { href: '/painel/configuracoes', label: 'Configurações', permissao: 'usuarios' },
    ],
  },
]

const navEmConstrucao: NavGroup[] = []

export function Sidebar({
  permissoes, isMaster, badges = {},
}: {
  permissoes: string[]
  isMaster: boolean
  badges?: Record<string, number>
}) {
  const pathname = usePathname()
  const router = useRouter()
  // '/painel/integracoes/lojas' NÃO é exactOnly de propósito: a página
  // sempre redireciona pra dentro de mercado-livre/[conexaoId] quando há
  // conexão, então "exact" nunca bateria e "Minhas Lojas" nunca ficaria
  // destacada estando na própria tela da loja.
  const exactOnly = ['/painel', '/painel/estoque', '/painel/integracoes']
  const isActive = (href: string) =>
    exactOnly.includes(href) ? pathname === href : pathname.startsWith(href)

  const podeVer = (item: NavItem) =>
    !item.permissao || temPermissao(permissoes, item.permissao, isMaster)

  // Seções recolhíveis: padrão é FECHADO, só abre sozinha a seção onde você
  // está (nunca esconde onde você está). Seção aberta manualmente fica salva
  // no navegador — abre de novo mesmo depois de recarregar.
  const [abertasManual, setAbertasManual] = useState<Record<string, boolean>>({})
  useEffect(() => {
    try {
      setAbertasManual(JSON.parse(localStorage.getItem('tc-sidebar-abertas') ?? '{}'))
    } catch { /* localStorage indisponível ou lixo salvo — ignora, fica tudo fechado */ }
  }, [])
  const alternarSecao = (grupo: string, aberta: boolean) => {
    setAbertasManual((prev) => {
      const proximo = { ...prev, [grupo]: aberta }
      try { localStorage.setItem('tc-sidebar-abertas', JSON.stringify(proximo)) } catch { /* ignora */ }
      return proximo
    })
  }

  // PRÉ-CARREGA TODAS as abas que a pessoa pode ver, ao abrir o painel (pedido do
  // Vitor: "carrega tudo no início e fica tranquilo"). O Next só prefetcha no hover;
  // aqui a gente força todas. Escalonado (uma a cada 250ms, quando o navegador está
  // ocioso) pra não brigar com o carregamento da tela atual. Roda uma vez.
  useEffect(() => {
    const rotas = navCompleto.flatMap((s) => s.items).filter(podeVer).map((i) => i.href)
    let i = 0
    let parar = false
    const agenda = (fn: () => void) =>
      (window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 300)))(fn)
    const proxima = () => {
      if (parar || i >= rotas.length) return
      router.prefetch(rotas[i])
      i++
      window.setTimeout(() => agenda(proxima), 250)
    }
    const t = window.setTimeout(() => agenda(proxima), 1200) // deixa a tela atual carregar primeiro
    return () => { parar = true; window.clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-white">
      {/* Logo — marca no topo, clicável → Dashboard (pedido Isa) */}
      <Link href="/painel" title="Ir para o Dashboard"
        className="flex h-[72px] items-center gap-2.5 border-b border-gray-200 px-4 transition hover:bg-gray-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tecnocell-icon.png" alt="TecnoCell" className="h-14 w-14 shrink-0 object-contain" />
        <div className="flex flex-col leading-none">
          <span className="text-[18px] font-extrabold tracking-tight text-gray-900">TecnoCell</span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#1B6CA8]">Cloud</span>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {/* Módulos completos */}
        {navCompleto.map((section) => {
          const itensVisiveis = section.items.filter(podeVer)
          if (!itensVisiveis.length) return null
          const temAtivo = itensVisiveis.some((item) => isActive(item.href))
          const aberta = temAtivo || !!abertasManual[section.group]
          return (
            <details key={section.group} open={aberta}
              onToggle={(e) => alternarSecao(section.group, e.currentTarget.open)}
              className="group/section mb-1">
              <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 hover:text-gray-600 [&::-webkit-details-marker]:hidden">
                {section.group}
                <svg className="h-3 w-3 shrink-0 text-gray-300 transition-transform group-open/section:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </summary>
              {itensVisiveis.map((item) => {
                const Ic = ICONS[item.href]
                return (
                  <Link key={item.href} href={item.href}
                    className={cn(
                      // 'tc-ativo' cria a barrinha laranja que cresce no item onde você está:
                      // responde "onde eu estou?" de relance, sem precisar ler o menu inteiro.
                      'group flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors',
                      isActive(item.href)
                        ? 'tc-ativo bg-blue-50 text-blue-700'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    )}>
                    {Ic
                      ? <Ic className={cn(
                          'h-[18px] w-[18px] shrink-0 transition-transform duration-200',
                          isActive(item.href)
                            ? 'text-[#1B6CA8] scale-110'          // o ativo cresce um tico
                            : 'text-gray-400 group-hover:scale-110',  // e o que você mira, também
                        )} />
                      : <span className={cn('h-1.5 w-1.5 rounded-full', isActive(item.href) ? 'bg-accent-500' : 'bg-gray-300')} />}
                    {item.label}
                    {badges[item.href] > 0 && (
                      <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {badges[item.href]}
                      </span>
                    )}
                  </Link>
                )
              })}
            </details>
          )
        })}

        {/* Divisor — só quando há módulos em construção */}
        {navEmConstrucao.length > 0 && (
          <div className="mx-4 my-3 border-t border-dashed border-gray-200" />
        )}

        {/* Módulos em construção */}
        {navEmConstrucao.map((section) => {
          const itensVisiveis = section.items.filter(podeVer)
          if (!itensVisiveis.length) return null
          return (
            <div key={section.group} className="mb-1">
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-400">
                🚧 {section.group}
              </p>
              {itensVisiveis.map((item) => (
                <Link key={item.href} href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-amber-50 text-amber-700'
                      : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                  )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', isActive(item.href) ? 'bg-amber-400' : 'bg-gray-200')} />
                  {item.label}
                </Link>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Footer — logout via POST */}
      <div className="border-t border-gray-200 p-3">
        <form action="/api/auth/signout" method="POST">
          <button type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
