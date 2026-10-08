import { createServiceClient } from '@/lib/supabase/server'
import { marcarEntregue, gerarPagamentoMotoboy } from './actions'
import { formatBRL, formatDate } from '@/lib/utils'

type VendaEntrega = {
  id: string; numero: number | null; total: number | null
  rota_entrega: string | null; horario_entrega: string | null; endereco_entrega: string | null
  entregue_por: string | null; created_at: string
  pessoas: { nome: string } | null
}

export default async function EntregasPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { erro, ok } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: vendas }, { data: motoboys }] = await Promise.all([
    supabase.from('vendas')
      .select('id, numero, total, rota_entrega, horario_entrega, endereco_entrega, entregue_por, created_at, pessoas(nome)')
      .eq('tipo_entrega', 'entrega')
      .is('entregue_em', null)
      .order('created_at'),
    supabase.from('pessoas').select('id, nome').ilike('nome', '%boy%').eq('ativo', true).order('nome'),
  ])

  const lista = (vendas ?? []) as unknown as VendaEntrega[]
  const boys = (motoboys ?? []) as { id: string; nome: string }[]

  // Motoboys EMPREGADOS (perfis com cargo MOTOBOY) pra gerar o pagamento.
  const { data: cargoMotoboy } = await supabase.from('cargos').select('id').eq('nome', 'MOTOBOY').maybeSingle()
  const { data: motoboyPerfis } = cargoMotoboy
    ? await supabase.from('perfis').select('id, nome, motoboy_valor_fixo, motoboy_adicional_loja, motoboy_adicional_extra').eq('ativo', true).eq('cargo_id', (cargoMotoboy as { id: string }).id).order('nome')
    : { data: [] }
  const motoboysPerfil = (motoboyPerfis ?? []) as { id: string; nome: string; motoboy_valor_fixo: number | null; motoboy_adicional_loja: number | null; motoboy_adicional_extra: number | null }[]
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  // Itens de cada venda (peças) — join produtos(nome)
  const vendaIds = lista.map((v) => v.id)
  const { data: itens } = vendaIds.length > 0
    ? await supabase.from('itens_venda').select('venda_id, quantidade, produtos(nome)').in('venda_id', vendaIds)
    : { data: [] }
  const itensPorVenda = new Map<string, { nome: string; qtd: number }[]>()
  for (const it of (itens ?? []) as unknown as { venda_id: string; quantidade: number; produtos: { nome: string } | null }[]) {
    const arr = itensPorVenda.get(it.venda_id) ?? []
    arr.push({ nome: it.produtos?.nome ?? 'Peça', qtd: it.quantidade })
    itensPorVenda.set(it.venda_id, arr)
  }

  // Agrupa por rota + horário
  const grupos = new Map<string, VendaEntrega[]>()
  for (const v of lista) {
    const rota = v.rota_entrega ? v.rota_entrega[0].toUpperCase() + v.rota_entrega.slice(1) : 'Sem rota'
    const chave = `${rota} — ${v.horario_entrega || 'sem horário'}`
    ;(grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push(v)
  }
  const gruposOrdenados = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  const totalPecas = lista.reduce((s, v) => s + (itensPorVenda.get(v.id) ?? []).reduce((x, i) => x + i.qtd, 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🛵</span>
        <h2 className="text-2xl font-bold text-gray-900">Entregas do motoboy</h2>
      </div>

      <form action={gerarPagamentoMotoboy} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-800">💸 Pagamento do motoboy (gera conta a pagar no financeiro)</p>
        {erro && <p className="text-sm text-rose-700">{erro}</p>}
        {ok && <p className="text-sm text-emerald-700">{ok}</p>}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Motoboy</label>
            <select name="perfil_id" className="field w-72 text-sm">
              <option value="">Escolha…</option>
              {motoboysPerfil.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} — diária R$ {Number(m.motoboy_valor_fixo ?? 0).toFixed(2)} · R$ {Number(m.motoboy_adicional_loja ?? 0).toFixed(2)}/ent · R$ {Number(m.motoboy_adicional_extra ?? 0).toFixed(2)}/extra
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Data</label>
            <input type="date" name="data" defaultValue={hoje} className="field text-sm" />
          </div>
          <button type="submit" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition">Gerar conta a pagar</button>
        </div>
      </form>

      <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
        <span className="font-semibold text-blue-800">{lista.length} entrega(s) pendente(s)</span>
        <span className="text-blue-600">· {totalPecas} peça(s) pra sair</span>
      </div>

      {lista.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">Nenhuma entrega pendente. 🎉</p>
      ) : (
        gruposOrdenados.map(([chave, grupo]) => (
          <div key={chave} className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
              <p className="text-sm font-semibold text-gray-700">🛵 {chave}</p>
              <span className="text-xs text-gray-400">{grupo.length} entrega(s)</span>
            </div>
            <div className="divide-y divide-gray-50">
              {grupo.map((v) => {
                const pec = itensPorVenda.get(v.id) ?? []
                return (
                  <div key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{v.pessoas?.nome ?? 'Cliente'}</p>
                      <p className="text-xs text-gray-500">
                        {pec.map((i) => `${i.qtd}x ${i.nome}`).join(' · ') || '—'}
                        {v.endereco_entrega ? ` — 📍 ${v.endereco_entrega}` : ''}
                      </p>
                      <p className="text-[11px] text-gray-400">Venda #{v.numero ?? '—'} · {formatBRL(v.total ?? 0)} · {formatDate(v.created_at)}</p>
                    </div>
                    <form action={marcarEntregue} className="flex items-center gap-2">
                      <input type="hidden" name="venda_id" value={v.id} />
                      <select name="motoboy" defaultValue={v.entregue_por ?? ''} className="field w-40 text-xs">
                        <option value="">Motoboy…</option>
                        {boys.map((b) => <option key={b.id} value={b.nome}>{b.nome}</option>)}
                      </select>
                      <button type="submit" className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition">
                        ✓ Entregue
                      </button>
                    </form>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
