'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TrocaLinha } from './page'
import { definirFornecedor, marcarEnviada, confirmarRetorno, marcarPerdida, excluirTroca, lancarTrocaManual } from './actions'

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')

const CORES: Record<string, string> = {
  aberta: 'bg-amber-100 text-amber-700',
  enviada: 'bg-blue-100 text-blue-700',
  retornou: 'bg-emerald-100 text-emerald-700',
  perdida: 'bg-rose-100 text-rose-700',
  cancelada: 'bg-gray-100 text-gray-500',
}
const ROTULO: Record<string, string> = {
  aberta: 'Aberta', enviada: 'No fornecedor', retornou: 'Retornou', perdida: 'Perdida', cancelada: 'Cancelada',
}

export function TrocasClient({
  linhas,
  fornecedores,
  depositos,
  erro,
}: {
  linhas: TrocaLinha[]
  fornecedores: { id: string; nome: string }[]
  depositos: { id: string; nome: string }[]
  erro?: string
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [msg, setMsg] = useState<string | null>(erro ?? null)
  const [filtro, setFiltro] = useState<'todas' | 'aberta' | 'enviada' | 'retornou' | 'perdida'>('todas')

  const visiveis = linhas.filter((l) => filtro === 'todas' || l.status === filtro)

  function rodar(fn: () => Promise<unknown>) {
    iniciar(async () => {
      setMsg(null)
      const r = await fn().catch((e: unknown) => ({ ok: false, erro: e instanceof Error ? e.message : 'erro' }))
      const res = r as { ok?: boolean; erro?: string } | undefined
      if (res && res.ok === false && res.erro) setMsg(res.erro)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {msg && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>}

      <div className="flex flex-wrap items-center gap-2">
        {(['todas', 'aberta', 'enviada', 'retornou', 'perdida'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filtro === f ? 'bg-[#1B6CA8] text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {f === 'todas' ? 'Todas' : ROTULO[f]} ({f === 'todas' ? linhas.length : linhas.filter((l) => l.status === f).length})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2">Saiu em</th>
              <th className="px-3 py-2">Peça</th>
              <th className="px-3 py-2 text-center">Qtd</th>
              <th className="px-3 py-2 text-right">Custo</th>
              <th className="px-3 py-2">Loja</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2 text-center">Dias</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visiveis.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-gray-400">Nenhuma troca {filtro === 'todas' ? 'registrada' : `em "${ROTULO[filtro]}"`}.</td></tr>
            ) : visiveis.map((l) => (
              <tr key={l.id} className="hover:bg-blue-50/40 transition">
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{dataBR(l.data_saida)}</td>
                <td className="px-3 py-2">
                  <p className="font-medium text-gray-800">{l.produto_nome ?? l.produto_id}</p>
                  {l.produto_retorno_nome && l.produto_retorno_nome !== l.produto_nome && (
                    <p className="text-[11px] text-emerald-700">voltou: {l.produto_retorno_nome}</p>
                  )}
                  {l.pessoa_nome && <p className="text-[11px] text-gray-400">cliente: {l.pessoa_nome}</p>}
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{l.quantidade}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(l.custo)}</td>
                <td className="px-3 py-2 text-gray-600">{l.loja ?? '—'}</td>
                <td className="px-3 py-2">
                  {l.status === 'retornou' || l.status === 'perdida' ? (
                    <span className="text-gray-600">{l.fornecedor_nome ?? '—'}</span>
                  ) : (
                    <select
                      defaultValue={l.fornecedor_id ?? ''}
                      disabled={pendente}
                      onChange={(e) => rodar(() => { const fd = new FormData(); fd.set('id', l.id); fd.set('fornecedor_id', e.target.value); return definirFornecedor(fd) })}
                      className="rounded-lg border border-gray-200 px-1.5 py-1 text-xs text-gray-700"
                    >
                      <option value="">— escolher —</option>
                      {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2 text-center tabular-nums text-gray-600">{l.dias}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CORES[l.status] ?? 'bg-gray-100 text-gray-600'}`}>{ROTULO[l.status] ?? l.status}</span>
                  {l.perda ? <p className="mt-0.5 text-[11px] text-rose-600">perda {fmt(l.perda)}</p> : null}
                  {l.observacao && <p className="mt-0.5 text-[11px] text-gray-400">{l.observacao}</p>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {l.status === 'aberta' && (
                      <button
                        disabled={pendente}
                        onClick={() => rodar(() => { const fd = new FormData(); fd.set('id', l.id); return marcarEnviada(fd) })}
                        className="rounded border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        Enviei
                      </button>
                    )}
                    {(l.status === 'aberta' || l.status === 'enviada') && (
                      <>
                        <button
                          disabled={pendente}
                          onClick={() => rodar(() => { const fd = new FormData(); fd.set('id', l.id); return confirmarRetorno(fd) })}
                          className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          title="Voltou a mesma peça — entra no PETRÓPOLIS ESTOQUE"
                        >
                          ✓ Chegou
                        </button>
                        <button
                          disabled={pendente}
                          onClick={() => rodar(() => { const fd = new FormData(); fd.set('id', l.id); return marcarPerdida(fd) })}
                          className="rounded border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                          title="Fornecedor recusou: fecha como perda"
                        >
                          Perdida
                        </button>
                      </>
                    )}
                    {l.status !== 'retornou' && (
                      <button
                        disabled={pendente}
                        onClick={() => {
                          if (!confirm('Excluir esta troca?\n\nA peça volta para o estoque de onde saiu (o lançamento foi feito por engano).')) return
                          rodar(() => { const fd = new FormData(); fd.set('id', l.id); return excluirTroca(fd) })
                        }}
                        className="rounded border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NovaTroca depositos={depositos} pendente={pendente} rodar={rodar} />

      <p className="text-[11px] leading-snug text-gray-400">
        A peça sai do estoque como movimento de <b>troca</b> e não volta sozinha. O check de retorno dá entrada no
        <b> PETRÓPOLIS ESTOQUE</b> — nunca no LOJA. Peça substituta mais barata gera a perda da diferença.
      </p>
    </div>
  )
}

function NovaTroca({
  depositos,
  pendente,
  rodar,
}: {
  depositos: { id: string; nome: string }[]
  pendente: boolean
  rodar: (fn: () => Promise<unknown>) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [produto, setProduto] = useState('')
  const [qtd, setQtd] = useState('1')
  const [dep, setDep] = useState('')
  const [motivo, setMotivo] = useState('')
  const [tirar, setTirar] = useState(true)

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
        + Lançar troca na mão
      </button>
    )
  }

  async function buscarProduto(termo: string) {
    const r = await fetch(`/api/produtos/busca?termo=${encodeURIComponent(termo)}`).catch(() => null)
    if (!r || !r.ok) return
    const lista = (await r.json()) as { id: string; nome: string }[]
    if (lista[0] && !produto) setProduto(lista[0].id)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
      <p className="text-sm font-semibold text-gray-700">Lançar troca na mão</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-gray-500">
          Código ou ID do produto
          <input value={produto} onChange={(e) => setProduto(e.target.value)} onBlur={(e) => buscarProduto(e.target.value)} placeholder="ex: 6880e8b9bd5ca4a5…" className="field mt-1 text-xs" />
        </label>
        <label className="text-xs text-gray-500">
          Quantidade
          <input value={qtd} onChange={(e) => setQtd(e.target.value)} inputMode="numeric" className="field mt-1 text-xs" />
        </label>
        <label className="text-xs text-gray-500">
          Saiu do depósito
          <select value={dep} onChange={(e) => setDep(e.target.value)} className="field mt-1 text-xs">
            <option value="">— escolher —</option>
            {depositos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Motivo
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex: defeito no frontal" className="field mt-1 text-xs" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={tirar} onChange={(e) => setTirar(e.target.checked)} />
        Já tirar do estoque agora
      </label>
      <div className="flex gap-2">
        <button
          disabled={pendente || !produto}
          onClick={() => rodar(() => {
            const fd = new FormData()
            fd.set('produto_id', produto.trim())
            fd.set('quantidade', qtd)
            fd.set('deposito_saida_id', dep)
            fd.set('motivo', motivo)
            if (tirar) fd.set('tirar_do_estoque', '1')
            return lancarTrocaManual(fd).then((r) => { if (r.ok) setAberto(false); return r })
          })}
          className="rounded-lg bg-[#1B6CA8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#155a8a] disabled:opacity-50"
        >
          Salvar
        </button>
        <button onClick={() => setAberto(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
      </div>
    </div>
  )
}
