import { createServiceClient } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { IconPlus, IconClipboard } from '@/components/icons'
import Link from 'next/link'
import { PedidosFiltros } from './PedidosFiltros'
import { PedidosLista } from './PedidosLista'
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

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; status?: string; q?: string; ordem?: string; dir?: string; loja?: string }>
}) {
  const { tipo, status, q, ordem, dir, loja } = await searchParams
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
  const sortLink = (o: string) => {
    const ativo = ordemAtual === o
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'desc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParams, ordem: o, ...(nextDir === 'asc' ? { dir: 'asc' } : {}) }).toString()
    return { href: `/painel/pedidos?${qs}`, arrow, ativo }
  }

  // catálogos pra traduzir id → nome (loja, forma) numa ida só cada
  const [pedidosRes, vendasRes, { data: depositos }, { data: lojas }, { data: formas }] = await Promise.all([
    supabase.from('pedidos')
      .select('id, numero, tipo, status, total, created_at, deposito_id, forma_pagamento_id, pessoas(nome)')
      .order('created_at', { ascending: false }).limit(300),
    supabase.from('vendas')
      .select('id, numero, status, total, created_at, deposito_id, caixa_id, forma_pagamento_id, pessoas(nome)')
      .order('created_at', { ascending: false }).limit(300),
    supabase.from('depositos').select('id, loja_id'),
    supabase.from('lojas').select('id, nome'),
    supabase.from('formas_pagamento').select('id, nome'),
  ])
  const lojaDoDep: Record<string, string> = {}
  for (const d of depositos ?? []) {
    const nome = (lojas ?? []).find((l) => l.id === d.loja_id)?.nome
    if (nome) lojaDoDep[d.id] = nome
  }
  // Venda do PDV: a loja vem do CAIXA (o depósito tem loja NULL em alguns).
  // Mesma lógica do Painel de Vendas. Isa 29/07.
  const caixaIds = [...new Set((vendasRes.data ?? []).map((v) => v.caixa_id).filter(Boolean))] as string[]
  const { data: caixas } = caixaIds.length
    ? await supabase.from('caixas').select('id, loja_id').in('id', caixaIds)
    : { data: [] as { id: string; loja_id: string | null }[] }
  const lojaDoCaixa: Record<string, string> = {}
  for (const c of caixas ?? []) {
    const nome = (lojas ?? []).find((l) => l.id === c.loja_id)?.nome
    if (nome) lojaDoCaixa[c.id] = nome
  }
  const nomeForma: Record<string, string> = {}
  for (const f of formas ?? []) nomeForma[f.id] = f.nome

  const nomeCli = (r: { pessoas?: unknown }) => (r.pessoas as { nome: string } | null)?.nome ?? null

  const linhas: Linha[] = [
    ...(pedidosRes.data ?? []).map((p): Linha => ({
      id: p.id, numero: p.numero, tipo: p.tipo === 'orcamento' ? 'orcamento' : 'pedido',
      status: p.status, total: Number(p.total) || 0, created_at: p.created_at,
      cliente: nomeCli(p), loja: p.deposito_id ? lojaDoDep[p.deposito_id] ?? null : null,
      forma: p.forma_pagamento_id ? nomeForma[p.forma_pagamento_id] ?? null : null,
    })),
    ...(vendasRes.data ?? []).map((v): Linha => ({
      id: v.id, numero: v.numero, tipo: 'venda',
      status: v.status, total: Number(v.total) || 0, created_at: v.created_at,
      cliente: nomeCli(v), loja: (v.caixa_id && lojaDoCaixa[v.caixa_id]) || (v.deposito_id ? lojaDoDep[v.deposito_id] ?? null : null),
      forma: v.forma_pagamento_id ? nomeForma[v.forma_pagamento_id] ?? null : null,
    })),
  ]

  // Loja/empresa: gerente vê todas; atendente só a(s) permitida(s). Adendo Isa 29/07.
  const { permitidas, todas: vemTodas } = await lojasDoUsuario()
  const nomesPermitidos = permitidas.map((l) => l.nome)

  // filtros (o "tipo=venda" é novo; status casa nos dois vocabulários)
  const busca = q?.toLowerCase().trim() ?? ''
  const lista = linhas
    .filter((l) => vemTodas || !l.loja || nomesPermitidos.includes(l.loja))
    .filter((l) => !loja || l.loja === loja)
    .filter((l) => !tipo || l.tipo === tipo)
    .filter((l) => {
      if (!status) return true
      // "faturado" tem que pegar tanto pedido faturado quanto venda concluida
      if (status === 'faturado')  return l.status === 'faturado'  || l.status === 'concluida'
      if (status === 'cancelado') return l.status === 'cancelado' || l.status === 'cancelada'
      return l.status === status
    })
    .filter((l) => {
      if (!busca) return true
      return (l.cliente ?? '').toLowerCase().includes(busca) || String(l.numero ?? '').includes(busca)
    })
    .sort((a, b) => {
      const dirMul = ordemDir ? -1 : 1
      // comparação pt-BR: alfabética de verdade (ignora acento e maiúsc/minúsc)
      const cmp = (x: string | null, y: string | null) => (x ?? '').localeCompare(y ?? '', 'pt-BR', { sensitivity: 'base' })
      if (ordemAtual === 'numero') return ((a.numero ?? 0) - (b.numero ?? 0)) * dirMul
      if (ordemAtual === 'total')  return (a.total - b.total) * dirMul
      if (ordemAtual === 'tipo')   return cmp(a.tipo, b.tipo) * dirMul
      if (ordemAtual === 'status') return cmp(a.status, b.status) * dirMul
      if (ordemAtual === 'loja')    return cmp(a.loja, b.loja) * dirMul
      if (ordemAtual === 'cliente') return cmp(a.cliente, b.cliente) * dirMul
      if (ordemAtual === 'forma')   return cmp(a.forma, b.forma) * dirMul
      return a.created_at.localeCompare(b.created_at) * dirMul
    })

  const sortLinks = Object.fromEntries(
    ['numero', 'created_at', 'tipo', 'status', 'loja', 'cliente', 'forma', 'total'].map((o) => [o, sortLink(o)]),
  )

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
        lojas={nomesPermitidos}
        total={lista.length}
      />

      {/* Tabela */}
      <PedidosLista lista={lista} sortLinks={sortLinks} />
    </div>
  )
}
