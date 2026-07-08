'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { criarPedido, buscarClientesPedido } from '../actions'

const supabaseBrowser = createClient()

const hoje = new Date()
const daqui30 = new Date(hoje)
daqui30.setDate(hoje.getDate() + 30)
const DEFAULT_VALIDADE = daqui30.toISOString().split('T')[0]

const ORIGENS = [
  { value: 'balcao',    label: 'Balcão' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'telefone',  label: 'Telefone' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'outro',     label: 'Outro' },
]

type Pessoa   = { id: string; nome: string }
type Deposito = { id: string; nome: string }
type Tabela   = { id: string; nome: string }
type Forma    = { id: string; nome: string }

export function NovoPedidoForm({
  depositos,
  tabelas,
  formas,
  erro,
}: {
  depositos: Deposito[]
  tabelas:   Tabela[]
  formas:    Forma[]
  erro?:     string
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  // Autocomplete cliente SOB DEMANDA (busca no servidor; antes filtrava 500 capados)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clienteSel, setClienteSel] = useState<Pessoa | null>(null)
  const [sugestoes, setSugestoes] = useState<Pessoa[]>([])
  useEffect(() => {
    const q = buscaCliente.trim()
    if (!q || clienteSel) { setSugestoes([]); return }
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const { data } = await supabaseBrowser.auth.getSession()
        const achados = await buscarClientesPedido(data.session?.access_token ?? '', q)
        if (vivo) setSugestoes(achados)
      } catch { /* silencioso */ }
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [buscaCliente, clienteSel])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitting(true)
    const fd = new FormData(e.currentTarget)
    await criarPedido(fd)
    // criarPedido faz redirect interno, não chega aqui normalmente
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      {/* Tipo */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Tipo *</label>
          <select name="tipo" className="field" required>
            <option value="orcamento">Orçamento</option>
            <option value="pedido">Pedido</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Origem da Venda</label>
          <select name="origem" className="field">
            {ORIGENS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Cliente autocomplete */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Cliente</label>
        <div className="relative">
          <input
            value={buscaCliente}
            onChange={(e) => { setBuscaCliente(e.target.value); setClienteSel(null) }}
            className="field w-full"
            placeholder="Digite o nome do cliente..."
            autoComplete="off"
          />
          <input type="hidden" name="pessoa_id" value={clienteSel?.id ?? ''} />
          {sugestoes.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {sugestoes.map(p => (
                <button key={p.id} type="button"
                  onMouseDown={(e) => { e.preventDefault(); setClienteSel(p); setBuscaCliente(p.nome) }}
                  className="flex w-full px-4 py-2.5 hover:bg-blue-50 text-left text-sm font-medium text-gray-800">
                  {p.nome}
                </button>
              ))}
            </div>
          )}
        </div>
        {clienteSel && (
          <p className="mt-1 text-xs text-green-600">✓ {clienteSel.nome} selecionado</p>
        )}
      </div>

      {/* Depósito + Tabela de Preços */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Depósito (Loja)</label>
          <select name="deposito_id" className="field">
            <option value="">— Selecione —</option>
            {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Tabela de Preços</label>
          <select name="tabela_preco_id" className="field">
            <option value="">— Preço padrão —</option>
            {tabelas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
      </div>

      {/* Forma de Pagamento + Validade */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Forma de Pagamento</label>
          <select name="forma_pagamento_id" className="field">
            <option value="">— A definir —</option>
            {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Validade</label>
          <input name="data_validade" type="date" className="field" defaultValue={DEFAULT_VALIDADE} />
        </div>
      </div>

      {/* Observações */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
        <textarea name="observacoes" rows={3} className="field" placeholder="Opcional..." />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={submitting}
          className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
          {submitting ? 'Criando...' : 'Criar'}
        </button>
        <button type="button" onClick={() => router.push('/painel/pedidos')}
          className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
          Cancelar
        </button>
      </div>
    </form>
  )
}
