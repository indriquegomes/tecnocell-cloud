import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { ConsignadoClient } from './ConsignadoClient'

function fmt(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function ConsignadoPage() {
  await requireAuth()
  const supabase = await createServiceClient()

  const [consignadosResult, formasResult] = await Promise.all([
    supabase
      .from('consignados')
      .select(`
        id, pessoa_id, pessoa_nome, observacoes, status, total, created_at,
        itens:itens_consignado(id, nome, quantidade, devolvido, preco_unitario)
      `)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('formas_pagamento')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome'),
  ])

  type ItemConsignado = { id: string; nome: string; quantidade: number; devolvido: number; preco_unitario: number }
  type Consignado = {
    id: string
    pessoa_id: string | null
    pessoa_nome: string | null
    observacoes: string | null
    status: string
    total: number
    created_at: string
    itens: ItemConsignado[]
  }

  const consignados = (consignadosResult.data ?? []) as unknown as Consignado[]
  const formas = (formasResult.data ?? []) as { id: string; nome: string }[]

  const abertos = consignados.filter((c) => c.status === 'aberto' || c.status === 'parcial')
  const historico = consignados.filter((c) => c.status === 'devolvido' || c.status === 'acertado')

  const totalEmCirculacao = abertos.reduce((s, c) => s + (c.total ?? 0), 0)
  const totalEncerrados = historico.reduce((s, c) => s + (c.total ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Consignado</h2>
          <p className="text-sm text-gray-500 mt-0.5">Mercadorias em consignação — saída, devolução e acerto</p>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
          Nova saída via F12 no PDV
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-yellow-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Em Aberto</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{abertos.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmt(totalEmCirculacao)} em circulação</p>
        </div>
        <div className="rounded-xl border border-green-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Encerrados</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{historico.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmt(totalEncerrados)} recuperados</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total geral</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{consignados.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">saídas registradas</p>
        </div>
      </div>

      <ConsignadoClient abertos={abertos} historico={historico} formas={formas} />
    </div>
  )
}
