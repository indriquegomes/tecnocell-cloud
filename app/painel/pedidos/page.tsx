import { createServiceClient } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { IconPlus, IconClipboard } from '@/components/icons'
import Link from 'next/link'
import { PedidosFiltros } from './PedidosFiltros'
import { PedidosLista } from './PedidosLista'
import { Paginacao } from '@/components/Paginacao'
import { Dica } from '@/components/Dica'

// ═══════════════════════════════════════════════════════════════════
// PEDIDOS E ORÇAMENTOS — inclui as VENDAS do PDV.
//
// Isa: "Pedidos e orçamentos deveria mostrar todo o relatório de pedidos que
// fazemos no PDV. Não está sendo exibido."
//
// Causa: esta tela lia só a tabela `pedidos` (1 registro), enquanto o PDV grava
// em `vendas` (56). No SIGE TUDO é "Pedido" com um status ("Pedido Faturado",
// "Pedido Cancelado"), por isso lá aparece tudo junto. Aqui são dois modelos:
// orçamento/pedido é PRÉ-venda; venda é o fato consumado. Continuam separados no
// banco (têm ciclos de vida diferentes), mas a LISTA agora mostra os dois — que é
// o que ela precisa pra conferir o dia.
//
// Status traduzido pro vocabulário dela: venda concluída = "Faturado".
// ═══════════════════════════════════════════════════════════════════

type Linha = {
  id: string
  numero: number | null
  tipo: 'orcamento' | 'pedido' | 'venda'
  status: string
  total: number
  created_at: string
  cliente: string | null
  loja: string | null
  forma: string | null
}

const POR_PAGINA = 100

// Coluna da view (pedidos_vendas) pra cada coluna da tabela.
// 'cliente' ordena por cliente_norm (sem acento) pra A→Z de verdade.
const COLUNA_ORDEM: Record<string, string> = {
  numero: 'numero',
  created_at: 'created_at',
  tipo: 'tipo',
  status: 'status',
  loja: 'loja',
  cliente: 'cliente_norm',
  forma: 'forma',
  total: 'total',
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; status?: string; q?: string; ordem?: string; dir?: string; loja?: string; de?: string; ate?: string; pagina?: string }>
}) {
  const { tipo, status, q, ordem, dir, loja, de, ate, pagina } = await searchParams
  const supabase = await createServiceClient()

  const ordemAtual = ordem ?? 'cliente'
  // Padrão = ALFABÉTICO por cliente (A→Z) — pedido da Isa (26/07). A lista continua
  // ordenável por qualquer coluna; pra ver o dia de hoje é só clicar em DATA (aí vai
  // "mais recente primeiro"). Sem dir explícito, DATA ordena desc (recente) e as
  // demais colunas ordenam asc (A→Z), que é o que se espera de cada uma.
  const ordemDir = dir ? dir === 'desc' : ordemAtual === 'created_at'
  const baseParams: Record<string, string> = {}
  if (tipo)   baseParams.tipo   = tipo
  if (status) baseParams.status = status
  if (q)      baseParams.q      = q
  if (de)     baseParams.de     = de
  if (ate)    baseParams.ate    = ate
  const sortLink = (o: string) => {
    const ativo = ordemAtual === o
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'desc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParams, ordem: o, ...(nextDir === 'asc' ? { dir: 'asc' } : {}) }).toString()
    return { href: `/painel/pedidos?${qs}`, arrow, ativo }
  }

  // Busca paginada no SERVIDOR (view pedidos_vendas). Antes a tela puxava as
  // 48k vendas inteiras pro HTML via fetchAll e paginava/filtrava no cliente.
  const buscaRaw = q?.trim() ?? ''
  const paginaNum = Math.max(1, parseInt(pagina ?? '1', 10) || 1)
  const from = (paginaNum - 1) * POR_PAGINA
  const to = from + POR_PAGINA - 1

  // Loja/empresa: gerente vê todas; atendente só a(s) permitida(s). Adendo Isa 29/07.
  const { permitidas, todas: vemTodas } = await lojasDoUsuario()
  const nomesPermitidos = permitidas.map((l) => l.nome)

  let query = supabase
    .from('pedidos_vendas')
    .select('id, numero, tipo, status, total, created_at, cliente, loja, forma', { count: 'exact' })

  if (tipo) query = query.eq('tipo', tipo)
  if (status) {
    if (status === 'faturado') query = query.in('status', ['faturado', 'concluida'])
    else if (status === 'cancelado') query = query.in('status', ['cancelado', 'cancelada'])
    else query = query.eq('status', status)
  }
  if (!vemTodas) {
    if (nomesPermitidos.length) query = query.or(`loja.is.null,loja.in.(${nomesPermitidos.map((n) => `"${n}"`).join(',')})`)
    else query = query.is('loja', null)
  }
  if (loja) query = query.eq('loja', loja)
  if (de) query = query.gte('created_at', de)
  if (ate) query = query.lte('created_at', ate + 'T23:59:59')
  if (buscaRaw) {
    const buscaSafe = buscaRaw.replace(/[,%*]/g, '')
    query = query.or(`cliente.ilike.%${buscaSafe}%,numero_text.ilike.%${buscaSafe}%`)
  }

  const { data, count } = await query
    .order(COLUNA_ORDEM[ordemAtual] ?? 'cliente_norm', { ascending: !ordemDir })
    .range(from, to)
  const lista: Linha[] = (data ?? []).map((r): Linha => ({
    id: r.id as string,
    numero: r.numero as number | null,
    tipo: r.tipo as Linha['tipo'],
    status: r.status as string,
    total: Number(r.total) || 0,
    created_at: r.created_at as string,
    cliente: r.cliente as string | null,
    loja: r.loja as string | null,
    forma: r.forma as string | null,
  }))

  const total = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  const sortLinks = Object.fromEntries(
    ['numero', 'created_at', 'tipo', 'status', 'loja', 'cliente', 'forma', 'total'].map((o) => [o, sortLink(o)]),
  )

  const paginacaoParams: Record<string, string> = { ...baseParams }
  if (ordem) paginacaoParams.ordem = ordem
  if (dir) paginacaoParams.dir = dir

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconClipboard className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Pedidos e Orçamentos</h2>
          <Dica texto="Orçamentos e pedidos de clientes + as vendas fechadas no PDV. Orçamento vira venda ao ser faturado." />
        </div>
        <Link href="/painel/pedidos/novo"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
          <IconPlus className="h-4 w-4" /> Novo
        </Link>
      </div>

      {/* Filtros + busca */}
      <PedidosFiltros
        tipo={tipo ?? ''}
        status={status ?? ''}
        q={q ?? ''}
        loja={loja ?? ''}
        de={de ?? ''}
        ate={ate ?? ''}
        lojas={nomesPermitidos}
        total={total}
      />

      {/* Tabela */}
      <PedidosLista lista={lista} sortLinks={sortLinks} />

      <Paginacao
        pagina={paginaNum}
        totalPaginas={totalPaginas}
        total={total}
        params={paginacaoParams}
        basePath="/painel/pedidos"
      />
    </div>
  )
}
