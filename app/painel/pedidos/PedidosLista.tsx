'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { deletarPedido, carregarPedidosImpressao, carregarVendasImpressao } from './actions'
import { ConfirmButton } from '@/components/ConfirmButton'
import { DocumentoPedido, resumoPedidoTexto, cssImpressao, type PedidoImpr } from '@/components/DocumentoPedido'

const supabaseBrowser = createClient()
async function authToken(): Promise<string> {
  const { data } = await supabaseBrowser.auth.getSession()
  return data.session?.access_token ?? ''
}

const STATUS_SISTEMA: Record<string, string> = {
  rascunho: 'Rascunho', aprovado: 'Aprovado — Aguardando Faturamento', faturado: 'Faturado',
  cancelado: 'Cancelado', concluida: 'Faturado', cancelada: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  rascunho: 'text-gray-400', aprovado: 'text-yellow-600 font-medium', faturado: 'text-green-600 font-medium',
  cancelado: 'text-red-500', concluida: 'text-green-600 font-medium', cancelada: 'text-red-500',
}
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export type Linha = {
  id: string; numero: number | null; tipo: 'orcamento' | 'pedido' | 'venda'
  status: string; total: number; created_at: string
  cliente: string | null; loja: string | null; forma: string | null
}
type SortLink = { href: string; arrow: string; ativo: boolean }

const rotuloTipo = (t: Linha['tipo']) => (t === 'orcamento' ? 'Orçamento' : t === 'venda' ? 'Venda (PDV)' : 'Pedido')
const corTipo = (t: Linha['tipo']) =>
  t === 'orcamento' ? 'bg-purple-50 text-purple-700' : t === 'venda' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'

export function PedidosLista({ lista, sortLinks }: { lista: Linha[]; sortLinks: Record<string, SortLink> }) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [docs, setDocs] = useState<PedidoImpr[]>([])
  const [formato, setFormato] = useState<'a4' | 'cupom'>('a4')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const MAX_IMPR = 30 // trava: .in() com muitos ids estoura a URL (erro engolido) e o texto do WhatsApp fica gigante

  // toda linha é selecionável (orçamento, pedido E venda do PDV)
  const todosMarcados = lista.length > 0 && lista.every((l) => sel.has(l.id))
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleTodos = () => setSel(todosMarcados ? new Set() : new Set(lista.map((l) => l.id)))
  const limpar = () => { setSel(new Set()); setAviso('') }

  // busca os itens dos selecionados nas DUAS fontes (pedidos e vendas) e junta na ordem
  async function carregar(): Promise<PedidoImpr[]> {
    const token = await authToken()
    const selArr = [...sel]
    const tipoDe = (id: string) => lista.find((l) => l.id === id)?.tipo
    const pedIds = selArr.filter((id) => tipoDe(id) !== 'venda')
    const vendaIds = selArr.filter((id) => tipoDe(id) === 'venda')
    const [dp, dv] = await Promise.all([
      pedIds.length ? carregarPedidosImpressao(token, pedIds) : Promise.resolve([] as PedidoImpr[]),
      vendaIds.length ? carregarVendasImpressao(token, vendaIds) : Promise.resolve([] as PedidoImpr[]),
    ])
    const map = new Map([...dp, ...dv].map((d) => [d.id, d]))
    const ds = selArr.map((id) => map.get(id)).filter((d): d is PedidoImpr => !!d)
    setDocs(ds)
    return ds
  }
  const excedeu = () => { if (sel.size > MAX_IMPR) { setAviso(`Selecione até ${MAX_IMPR} por vez pra imprimir/enviar.`); return true } setAviso(''); return false }
  async function imprimir(f: 'a4' | 'cupom') {
    if (!sel.size || ocupado || excedeu()) return
    setOcupado(true)
    try { await carregar(); setFormato(f); setTimeout(() => window.print(), 80) } finally { setOcupado(false) }
  }
  async function enviarWhats() {
    if (!sel.size || ocupado || excedeu()) return
    setOcupado(true)
    try {
      const ds = await carregar()
      const texto = ds.map(resumoPedidoTexto).join('\n\n———\n\n')
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
    } finally { setOcupado(false) }
  }

  const th = (col: string, label: string, align = 'text-left') => {
    const s = sortLinks[col]
    if (!s) return <th className={`px-4 py-3 ${align} text-xs font-semibold text-gray-500 uppercase`}>{label}</th>
    return (
      <th className={`px-4 py-3 ${align} text-xs font-semibold text-gray-500 uppercase`}>
        <Link href={s.href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${s.ativo ? 'text-blue-600' : ''}`}>{label} <span className="text-gray-400">{s.arrow}</span></Link>
      </th>
    )
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 w-10">
                <input type="checkbox" checked={todosMarcados} onChange={toggleTodos}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" title="Marcar todos" />
              </th>
              {th('numero', 'Código')}
              {th('created_at', 'Data')}
              {th('tipo', 'Tipo')}
              {th('status', 'Status')}
              {th('loja', 'Empresa')}
              {th('cliente', 'Cliente')}
              {th('forma', 'Pagamento')}
              {th('total', 'Valor', 'text-right')}
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lista.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">
                Nenhum registro.{' '}<Link href="/painel/pedidos/novo" className="text-blue-500 hover:underline">Criar novo</Link>.
              </td></tr>
            ) : lista.map((l) => (
              <tr key={l.tipo + l.id} className={`transition ${sel.has(l.id) ? 'bg-blue-50' : 'hover:bg-blue-50/60'}`}>
                <td className="px-3 py-3">
                  <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                </td>
                <td className="px-4 py-3 text-sm font-mono text-gray-500">#{l.numero ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDt(l.created_at)}</td>
                <td className="px-4 py-3 text-sm"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${corTipo(l.tipo)}`}>{rotuloTipo(l.tipo)}</span></td>
                <td className={`px-4 py-3 text-sm whitespace-nowrap ${STATUS_COLOR[l.status] ?? 'text-gray-500'}`}>{STATUS_SISTEMA[l.status] ?? l.status}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.loja ?? '—'}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{l.cliente ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.forma ?? '—'}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800 tabular-nums">{fmt(l.total)}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link href={l.tipo === 'venda' ? `/painel/vendas?q=${l.numero ?? ''}` : `/painel/pedidos/${l.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">Abrir</Link>
                    {l.tipo !== 'venda' && (
                      <form action={deletarPedido.bind(null, l.id)}>
                        <ConfirmButton message="Excluir este pedido/orçamento?"
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-50 transition">Excluir</ConfirmButton>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Barra de ações flutuante (aparece ao marcar) */}
      {sel.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 shadow-xl">
          <span className="px-2 text-sm font-semibold text-gray-700">{sel.size} selecionado{sel.size > 1 ? 's' : ''}</span>
          {aviso && <span className="px-1 text-xs font-medium text-red-500">{aviso}</span>}
          <button disabled={ocupado} onClick={() => imprimir('a4')} className="rounded-lg bg-[#1B6CA8] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#155a8a] disabled:opacity-50 transition">🖨️ A4</button>
          <button disabled={ocupado} onClick={() => imprimir('cupom')} className="rounded-lg bg-[#1B6CA8] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#155a8a] disabled:opacity-50 transition">🧾 Cupom</button>
          <button disabled={ocupado} onClick={() => imprimir('a4')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition">⬇️ PDF</button>
          <button disabled={ocupado} onClick={enviarWhats} className="rounded-lg bg-[#F47920] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50 transition">🟢 WhatsApp</button>
          <button onClick={limpar} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 transition">✕ Cancelar</button>
        </div>
      )}

      {/* Documento(s) imprimível(is) — some da tela, aparece só ao imprimir */}
      <style dangerouslySetInnerHTML={{ __html: cssImpressao(formato) }} />
      <div id="pedido-print">
        {docs.map((d) => <DocumentoPedido key={d.id} p={d} formato={formato} />)}
      </div>
    </>
  )
}
