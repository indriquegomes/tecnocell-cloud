import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { IconPlus, IconClipboard } from '@/components/icons'
import { deletarPedido } from './actions'
import { ConfirmButton } from '@/components/ConfirmButton'
import Link from 'next/link'
import { PedidosFiltros } from './PedidosFiltros'
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

const STATUS_SISTEMA: Record<string, string> = {
  rascunho:  'Rascunho',
  aprovado:  'Aprovado — Aguardando Faturamento',
  faturado:  'Faturado',
  cancelado: 'Cancelado',
  concluida: 'Faturado',      // venda do PDV
  cancelada: 'Cancelado',     // venda do PDV
}
const STATUS_COLOR: Record<string, string> = {
  rascunho:  'text-gray-400',
  aprovado:  'text-yellow-600 font-medium',
  faturado:  'text-green-600 font-medium',
  cancelado: 'text-red-500',
  concluida: 'text-green-600 font-medium',
  cancelada: 'text-red-500',
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = (d: string) =>
  new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

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
  searchParams: Promise<{ tipo?: string; status?: string; q?: string; ordem?: string; dir?: string }>
}) {
  const { tipo, status, q, ordem, dir } = await searchParams
  const supabase = await createServiceClient()

  const ordemAtual = ordem ?? 'created_at'
  // Padrão = MAIS RECENTE primeiro. Antes era crescente: com 1 registro ninguém
  // notava, mas com as vendas do PDV na lista a Isa abriria a tela no dia 06/07 e
  // teria que rolar até o fim pra ver o dia de hoje — o oposto do que ela quer.
  const ordemDir = dir ? dir === 'desc' : true
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
      cliente: nomeCli(v), loja: v.deposito_id ? lojaDoDep[v.deposito_id] ?? null : null,
      forma: v.forma_pagamento_id ? nomeForma[v.forma_pagamento_id] ?? null : null,
    })),
  ]

  // filtros (o "tipo=venda" é novo; status casa nos dois vocabulários)
  const busca = q?.toLowerCase().trim() ?? ''
  const lista = linhas
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
      if (ordemAtual === 'numero') return ((a.numero ?? 0) - (b.numero ?? 0)) * dirMul
      if (ordemAtual === 'total')  return (a.total - b.total) * dirMul
      if (ordemAtual === 'tipo')   return a.tipo.localeCompare(b.tipo) * dirMul
      if (ordemAtual === 'status') return a.status.localeCompare(b.status) * dirMul
      return a.created_at.localeCompare(b.created_at) * dirMul
    })

  const rotuloTipo = (t: Linha['tipo']) =>
    t === 'orcamento' ? 'Orçamento' : t === 'venda' ? 'Venda (PDV)' : 'Pedido'
  const corTipo = (t: Linha['tipo']) =>
    t === 'orcamento' ? 'bg-purple-50 text-purple-700'
    : t === 'venda'   ? 'bg-emerald-50 text-emerald-700'
    : 'bg-blue-50 text-blue-700'

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
        total={lista.length}
      />

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[
                { o: 'numero',     l: 'Código', a: 'text-left' },
                { o: 'created_at', l: 'Data',   a: 'text-left' },
                { o: 'tipo',       l: 'Tipo',   a: 'text-left' },
                { o: 'status',     l: 'Status', a: 'text-left' },
              ].map(({ o, l, a }) => {
                const s = sortLink(o)
                return <th key={o} className={`px-4 py-3 ${a} text-xs font-semibold text-gray-500 uppercase`}>
                  <Link href={s.href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${s.ativo ? 'text-blue-600' : ''}`}>{l} <span className="text-gray-400">{s.arrow}</span></Link>
                </th>
              })}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Empresa</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Pagamento</th>
              {(() => { const s = sortLink('total'); return (
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                  <Link href={s.href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${s.ativo ? 'text-blue-600' : ''}`}>Valor <span className="text-gray-400">{s.arrow}</span></Link>
                </th>
              ) })()}
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lista.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum registro.{' '}
                  <Link href="/painel/pedidos/novo" className="text-blue-500 hover:underline">Criar novo</Link>.
                </td>
              </tr>
            ) : lista.map((l) => (
              <tr key={l.tipo + l.id} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm font-mono text-gray-500">#{l.numero ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDt(l.created_at)}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${corTipo(l.tipo)}`}>
                    {rotuloTipo(l.tipo)}
                  </span>
                </td>
                <td className={`px-4 py-3 text-sm whitespace-nowrap ${STATUS_COLOR[l.status] ?? 'text-gray-500'}`}>
                  {STATUS_SISTEMA[l.status] ?? l.status}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.loja ?? '—'}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{l.cliente ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.forma ?? '—'}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800 tabular-nums">{fmt(l.total)}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={l.tipo === 'venda' ? `/painel/vendas?q=${l.numero ?? ''}` : `/painel/pedidos/${l.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                      Abrir
                    </Link>
                    {/* Excluir SÓ em orçamento/pedido. Venda não se apaga — se cancela
                        ou se devolve; apagar sumiria com dinheiro do caixa e do
                        faturamento sem deixar rastro. */}
                    {l.tipo !== 'venda' && (
                      <form action={deletarPedido.bind(null, l.id)}>
                        <ConfirmButton message="Excluir este pedido/orçamento?"
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-50 transition">
                          Excluir
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
