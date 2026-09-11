'use client'

import Link from 'next/link'

export type ItemSeparacao = {
  id: string
  nome: string
  codigo: string | null
  quantidade: number
  prateleira: string | null
  series: string[]
}

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
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        #sep-print { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          #sep-print, #sep-print * { visibility: visible !important; }
          #sep-print { display: block; position: absolute; left: 0; top: 0; width: 100%;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #111; }
          @page { size: A4; margin: 12mm; }
        }` }} />

      {/* tela (não sai na impressão) */}
      <div className="mx-auto max-w-2xl space-y-4 print:hidden">
        <div className="flex items-center justify-between">
          <Link href="/painel/estoque/transferencias" className="text-sm text-gray-500 hover:text-gray-700">← Voltar</Link>
          <button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            🖨 Imprimir nota de separação
          </button>
        </div>
        <p className="text-sm text-gray-500">A nota sai com os itens, a quantidade e a gaveta de cada um — pra facilitar na hora de pegar.</p>
      </div>

      {/* documento A4 */}
      <div id="sep-print" style={{ fontFamily: 'Arial, sans-serif', color: '#111' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1B6CA8', paddingBottom: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#1B6CA8' }}>Tecno<span style={{ color: '#F47920' }}>Cell</span></div>
            <div style={{ fontSize: 11, color: '#666' }}>Separação de estoque</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#555' }}>
            <div style={{ fontWeight: 800, color: '#1B6CA8', fontSize: 14 }}>NOTA DE SEPARAÇÃO</div>
            <div>{fmtDate(createdAt)}</div>
          </div>
        </div>

        <div style={{ fontSize: 13, marginBottom: 12 }}>
          <b>De:</b> {origem} &nbsp;→&nbsp; <b>Para:</b> {destino}
          {observacao && <><br /><b>Obs:</b> {observacao}</>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#eef4f9', color: '#155a8a' }}>
              <th style={{ width: 24, textAlign: 'left', padding: 6, borderBottom: '1px solid #d8dde3' }}>✓</th>
              <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #d8dde3' }}>Produto</th>
              <th style={{ width: 56, textAlign: 'right', padding: 6, borderBottom: '1px solid #d8dde3' }}>Qtd</th>
              <th style={{ width: 120, textAlign: 'left', padding: 6, borderBottom: '1px solid #d8dde3' }}>Gaveta</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} style={{ verticalAlign: 'top' }}>
                <td style={{ padding: 6, borderBottom: '1px solid #eef1f4' }}><span style={{ display: 'inline-block', width: 14, height: 14, border: '1.5px solid #999', borderRadius: 3 }} /></td>
                <td style={{ padding: 6, borderBottom: '1px solid #eef1f4' }}>
                  {i.nome}
                  {i.codigo && <span style={{ color: '#888', fontSize: 10 }}> · {i.codigo}</span>}
                  {i.series.length > 0 && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>IMEIs: {i.series.join(', ')}</div>}
                </td>
                <td style={{ padding: 6, borderBottom: '1px solid #eef1f4', textAlign: 'right', fontWeight: 700 }}>{i.quantidade}</td>
                <td style={{ padding: 6, borderBottom: '1px solid #eef1f4', fontWeight: 700, color: '#155a8a' }}>{i.prateleira ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 26, borderTop: '1px dashed #bbb', paddingTop: 16, display: 'flex', gap: 40 }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#155a8a', textTransform: 'uppercase', marginBottom: 28 }}>Separação</div><div style={{ borderTop: '1px solid #333', fontSize: 11, color: '#666', paddingTop: 3 }}>Separado por / data</div></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#155a8a', textTransform: 'uppercase', marginBottom: 28 }}>Conferência</div><div style={{ borderTop: '1px solid #333', fontSize: 11, color: '#666', paddingTop: 3 }}>Conferido por / data</div></div>
        </div>
      </div>
    </>
  )
}
