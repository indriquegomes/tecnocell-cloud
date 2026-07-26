// Documento imprimível de um Pedido/Orçamento — usado no detalhe e na lista.
// Dois formatos: 'a4' (folha) e 'cupom' (bobina 80mm). Render puro (sem estado);
// quem usa controla o formato e chama window.print().
import { formatDate } from '@/lib/utils'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export type ItemImpr = { id: string; quantidade: number; preco_unitario: number; total_item: number; nome: string }
export type PedidoImpr = {
  id: string
  numero: number | null
  tipo: string
  pessoa_nome: string | null
  vendedor_nome: string | null
  created_at: string
  data_validade: string | null
  referencia_cliente: string | null
  observacoes: string | null
  desconto: number
  frete: number
  itens: ItemImpr[]
}

const rotulo = (p: PedidoImpr) => (p.tipo === 'orcamento' ? 'Orçamento' : p.tipo === 'venda' ? 'Venda' : 'Pedido')
const somaSub = (p: PedidoImpr) => p.itens.reduce((s, i) => s + (i.total_item ?? 0), 0)
const somaTot = (p: PedidoImpr) => Math.max(0, somaSub(p) - (p.desconto ?? 0) + (p.frete ?? 0))

// resumo em texto (Copiar / WhatsApp)
export function resumoPedidoTexto(p: PedidoImpr): string {
  const sub = somaSub(p), tot = somaTot(p)
  return [
    `*TecnoCell — ${rotulo(p)} nº ${p.numero ?? '—'}*`,
    `Cliente: ${p.pessoa_nome ?? 'Consumidor'}`,
    p.vendedor_nome ? `Vendedor: ${p.vendedor_nome}` : '',
    '',
    ...p.itens.map((i) => `• ${i.quantidade}x ${i.nome} — ${fmt(i.total_item ?? 0)}`),
    '',
    `Subtotal: ${fmt(sub)}`,
    (p.desconto ?? 0) > 0 ? `Desconto: - ${fmt(p.desconto)}` : '',
    (p.frete ?? 0) > 0 ? `Frete: ${fmt(p.frete)}` : '',
    `*TOTAL: ${fmt(tot)}*`,
    p.observacoes ? `\nObs: ${p.observacoes}` : '',
  ].filter((l) => l !== '').join('\n')
}

// CSS de impressão (esconde a tela, mostra só #pedido-print; define tamanho do papel)
export function cssImpressao(formato: 'a4' | 'cupom'): string {
  return `
    #pedido-print { display: none; }
    @media print {
      body * { visibility: hidden !important; }
      #pedido-print, #pedido-print * { visibility: visible !important; }
      #pedido-print { display: block; position: absolute; left: 0; top: 0; width: 100%;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #111; }
      ${formato === 'cupom'
        ? '@page { size: 80mm auto; margin: 4mm; } #pedido-print { width: 72mm; font-family: monospace; font-size: 12px; }'
        : '@page { size: A4; margin: 12mm; }'}
    }`
}

export function DocumentoPedido({ p, formato }: { p: PedidoImpr; formato: 'a4' | 'cupom' }) {
  const sub = somaSub(p), tot = somaTot(p)
  if (formato === 'cupom') {
    return (
      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#111', pageBreakAfter: 'always' }}>
        <div style={{ textAlign: 'center', fontWeight: 700 }}>TECNOCELL — PETRÓPOLIS</div>
        <div style={{ textAlign: 'center' }}>{rotulo(p)} nº {p.numero ?? '—'} · {fmtDate(p.created_at)}</div>
        <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
        <div>Cliente: {p.pessoa_nome ?? 'Consumidor'}</div>
        {p.vendedor_nome && <div>Vendedor: {p.vendedor_nome}</div>}
        <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
        {p.itens.map((i) => (
          <div key={i.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '5px 0' }}>
            <span style={{ width: 12, height: 12, border: '1px solid #333', borderRadius: 2, flex: '0 0 auto', marginTop: 1 }} />
            <div style={{ flex: 1 }}>{i.quantidade}x {i.nome}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><span>{fmt(i.total_item ?? 0)}</span></div>
            </div>
          </div>
        ))}
        <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{fmt(sub)}</span></div>
        {(p.desconto ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Desconto</span><span>-{fmt(p.desconto)}</span></div>}
        {(p.frete ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Frete</span><span>{fmt(p.frete)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>TOTAL</span><span>{fmt(tot)}</span></div>
        <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
        <div><b>Conferência:</b> ____________</div>
        <div><b>Separação:</b> ______________</div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>* * *</div>
      </div>
    )
  }
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#111', pageBreakAfter: 'always' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1B6CA8', paddingBottom: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#1B6CA8' }}>Tecno<span style={{ color: '#F47920' }}>Cell</span></div>
          <div style={{ fontSize: 11, color: '#666' }}>Petrópolis</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#555' }}>
          <div style={{ fontWeight: 800, color: '#1B6CA8', fontSize: 14 }}>{rotulo(p).toUpperCase()} Nº {p.numero ?? '—'}</div>
          <div>{fmtDate(p.created_at)}</div>
          {p.vendedor_nome && <div>Vendedor: {p.vendedor_nome}</div>}
          {p.data_validade && <div>Válido até {formatDate(p.data_validade)}</div>}
        </div>
      </div>
      <div style={{ fontSize: 13, marginBottom: 12 }}>
        Cliente: <b>{p.pessoa_nome ?? 'Consumidor'}</b>
        {p.referencia_cliente && <><br />Ref. do cliente: {p.referencia_cliente}</>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#eef4f9', color: '#155a8a' }}>
            <th style={{ width: 22, textAlign: 'left', padding: 6, borderBottom: '1px solid #d8dde3' }}>✓</th>
            <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #d8dde3' }}>Produto</th>
            <th style={{ textAlign: 'right', padding: 6, borderBottom: '1px solid #d8dde3' }}>Qtd</th>
            <th style={{ textAlign: 'right', padding: 6, borderBottom: '1px solid #d8dde3' }}>Unit.</th>
            <th style={{ textAlign: 'right', padding: 6, borderBottom: '1px solid #d8dde3' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {p.itens.map((i) => (
            <tr key={i.id}>
              <td style={{ padding: 6, borderBottom: '1px solid #eef1f4' }}><span style={{ display: 'inline-block', width: 14, height: 14, border: '1.5px solid #999', borderRadius: 3 }} /></td>
              <td style={{ padding: 6, borderBottom: '1px solid #eef1f4' }}>{i.nome}</td>
              <td style={{ padding: 6, borderBottom: '1px solid #eef1f4', textAlign: 'right' }}>{i.quantidade}</td>
              <td style={{ padding: 6, borderBottom: '1px solid #eef1f4', textAlign: 'right' }}>{fmt(i.preco_unitario)}</td>
              <td style={{ padding: 6, borderBottom: '1px solid #eef1f4', textAlign: 'right' }}>{fmt(i.total_item ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginLeft: 'auto', width: 240, fontSize: 13, marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Subtotal</span><span>{fmt(sub)}</span></div>
        {(p.desconto ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Desconto</span><span>− {fmt(p.desconto)}</span></div>}
        {(p.frete ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Frete</span><span>{fmt(p.frete)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1B6CA8', marginTop: 5, paddingTop: 6, fontWeight: 800, color: '#1B6CA8', fontSize: 16 }}><span>TOTAL</span><span>{fmt(tot)}</span></div>
      </div>
      {p.observacoes && <div style={{ fontSize: 12, marginTop: 14, color: '#444' }}><b>Obs:</b> {p.observacoes}</div>}
      <div style={{ marginTop: 26, borderTop: '1px dashed #bbb', paddingTop: 16, display: 'flex', gap: 40 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#155a8a', textTransform: 'uppercase', marginBottom: 28 }}>Conferência</div><div style={{ borderTop: '1px solid #333', fontSize: 11, color: '#666', paddingTop: 3 }}>Conferido por / data</div></div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#155a8a', textTransform: 'uppercase', marginBottom: 28 }}>Separação</div><div style={{ borderTop: '1px solid #333', fontSize: 11, color: '#666', paddingTop: 3 }}>Separado por / data</div></div>
      </div>
    </div>
  )
}
