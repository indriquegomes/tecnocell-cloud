'use client'

import { useState } from 'react'
import { editarLancamentoInline } from './actions'
import { formatBRL } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { marcarPago, desfazerPagamento, deletarLancamento } from './actions'
import { BotaoExcluir } from '@/components/ui/botao-excluir'

// Linha da tabela do Financeiro com EDIÇÃO INLINE: valor, forma, vencimento e
// categoria são campos editáveis direto (botão Salvar grava). O resto (marcar pago,
// desfazer, editar completo, excluir) continua como antes.
export function LinhaEditable({
  lanc,
  comprovanteUrl,
  idsDesfazer,
  formasOpc,
}: {
  lanc: {
    id: string
    descricao: string | null
    valor: number | null
    tipo: string
    status: string | null
    data_vencimento: string | null
    forma_pagamento: string | null
    pessoa_nome: string | null
    categoria: string | null
  }
  comprovanteUrl: string | null
  idsDesfazer: boolean
  formasOpc: string[]
}) {
  const [valor, setValor] = useState((lanc.valor ?? 0).toFixed(2))
  const [forma, setForma] = useState(lanc.forma_pagamento ?? '')
  const [venc, setVenc] = useState(lanc.data_vencimento?.slice(0, 10) ?? '')
  const [cat, setCat] = useState(lanc.categoria ?? '')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  async function salvar() {
    setSalvando(true); setMsg('')
    try {
      const fd = new FormData()
      fd.set('valor', valor)
      fd.set('data_vencimento', venc)
      fd.set('forma_pagamento', forma)
      fd.set('categoria', cat)
      const r = await editarLancamentoInline(lanc.id, fd)
      setMsg(r.ok ? '✓' : '✗ ' + (r.erro ?? ''))
    } catch {
      setMsg('✗ erro')
    } finally {
      setSalvando(false)
    }
  }

  const pago = (lanc.status ?? '').toLowerCase().includes('pago')
  const inputCls = 'w-full rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400'

  return (
    <tr className="hover:bg-blue-50/60 transition">
      <td className="px-4 py-3 text-sm text-gray-800">
        {lanc.descricao || '—'}
        {comprovanteUrl && (
          <a href={comprovanteUrl} target="_blank" rel="noreferrer" className="ml-1.5 text-blue-600 underline" title="Ver comprovante">📎</a>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">{lanc.pessoa_nome || '—'}</td>
      <td className="px-4 py-3">
        <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={inputCls} />
      </td>
      <td className="px-4 py-3">
        <input value={forma} onChange={(e) => setForma(e.target.value)} list="formas-lista" placeholder="Pix, conta…" className={inputCls} />
      </td>
      <td className="px-4 py-3">
        <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={inputCls + ' text-right font-bold'} />
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant={lanc.tipo === 'receber' ? 'success' : 'danger'}>{lanc.tipo === 'receber' ? 'Receber' : 'Pagar'}</Badge>
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant={pago ? 'success' : 'warning'}>{lanc.status || 'Pendente'}</Badge>
      </td>
      <td className="px-4 py-3">
        <input value={cat} onChange={(e) => setCat(e.target.value)} list="categorias-lista" placeholder="Categoria…" className={inputCls} />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition"
            title="Salvar alterações desta linha"
          >
            {salvando ? '…' : 'Salvar'}
          </button>
          {msg && <span className="text-xs text-gray-500" title={msg}>{msg}</span>}
          {!pago && (
            <form action={marcarPago.bind(null, lanc.id)} encType="multipart/form-data" className="flex items-center gap-1">
              {lanc.tipo === 'pagar' && (
                <input name="forma_pagamento" required list="formas-lista" defaultValue={lanc.forma_pagamento ?? ''} placeholder="Forma…" className="max-w-[7rem] rounded-lg border border-gray-200 px-1.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              )}
              <button type="submit" className="rounded-lg px-2.5 py-1 text-xs font-medium text-green-600 hover:bg-green-50 transition">Pago</button>
            </form>
          )}
          {pago && (lanc.tipo === 'pagar' || idsDesfazer) && (
            <form action={desfazerPagamento.bind(null, lanc.id)}>
              <button type="submit" className="rounded-lg px-2.5 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 transition">Desfazer</button>
            </form>
          )}
          <Link href={`/painel/financeiro/${lanc.id}/editar`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">Editar</Link>
          <BotaoExcluir action={deletarLancamento.bind(null, lanc.id)} mensagem="Excluir este lançamento?" />
        </div>
      </td>
    </tr>
  )
}
