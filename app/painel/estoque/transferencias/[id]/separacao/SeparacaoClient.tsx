'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export type ItemSeparacao = {
  id: string
  nome: string
  codigo: string | null
  quantidade: number
  prateleira: string | null
  series: string[]
}

// Cupom térmico (80mm) da separação — igual ao cupom do PDV. Abre e já manda
// imprimir sozinho; o botão de cima só pra reimprimir se precisar.
export function SeparacaoClient({
  origem,
  destino,
  observacao,
  createdAt,
  itens,
}: {
  origem: string
  destino: string
  observacao: string | null
  createdAt: string
  itens: ItemSeparacao[]
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [])

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        #sep-print { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          #sep-print, #sep-print * { visibility: visible !important; }
          #sep-print { display: block; position: absolute; left: 0; top: 0; width: 72mm;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #111; }
          @page { size: 80mm auto; margin: 4mm; }
        }` }} />

      {/* controles (não saem na impressão) */}
      <div className="mx-auto max-w-xs space-y-3 print:hidden">
        <div className="flex items-center justify-between">
          <Link href="/painel/estoque/transferencias" className="text-sm text-gray-500 hover:text-gray-700">← Voltar</Link>
          <button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            🖨 Imprimir de novo
          </button>
        </div>
        <p className="text-center text-sm text-gray-500">O cupom abre na impressora. Aperte Enter e vá separar.</p>
      </div>

      {/* cupom 80mm */}
      <div id="sep-print" style={{ fontFamily: 'monospace', fontSize: 12, color: '#111' }}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>TECNOCELL</div>
        <div style={{ textAlign: 'center' }}>SEPARACAO DE ESTOQUE</div>
        <div style={{ borderTop: '1px dashed #333', margin: '8px 0' }} />
        <div>DE:   {origem}</div>
        <div>PARA: {destino}</div>
        <div>{fmtDate(createdAt)}</div>
        {observacao && <div>Obs: {observacao}</div>}
        <div style={{ borderTop: '1px solid #333', margin: '8px 0' }} />
        {itens.map((i) => (
          <div key={i.id} style={{ margin: '6px 0' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ width: 12, height: 12, border: '1px solid #333', flex: '0 0 auto', marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <div>{i.quantidade}x {i.nome}</div>
                {i.codigo && <div style={{ color: '#555' }}>COD: {i.codigo}</div>}
                <div style={{ fontWeight: 700 }}>GAVETA: {i.prateleira ?? '---'}</div>
                {i.series.length > 0 && <div style={{ color: '#555' }}>IMEIs: {i.series.join(', ')}</div>}
              </div>
            </div>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #333', margin: '8px 0' }} />
        <div>Separado: ________________</div>
        <div>Conferido: ______________</div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>* * *</div>
      </div>
    </>
  )
}
