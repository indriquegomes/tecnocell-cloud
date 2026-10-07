'use client'

// Botão "Imprimir (PDF)" do relatório de Vendas: abre uma janela limpa
// com as vendas + devoluções e dispara o print (o dono salva como PDF).

export type VendaImpressao = {
  numero: number | null
  data: string
  cliente: string | null
  vendedor: string | null
  forma: string | null
  desconto: number
  total: number
  devolvido: number
}

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ImprimirVendas({ vendas, de, ate }: { vendas: VendaImpressao[]; de: string; ate: string }) {
  const imprimir = () => {
    const dt = (s: string) => new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const linhas = vendas.map((v) => {
      const dev = v.devolvido > 0 ? '−' + money(v.devolvido) : '—'
      return `<tr><td>${v.numero ?? '—'}</td><td>${dt(v.data)}</td><td>${v.cliente ?? '—'}</td><td>${v.vendedor ?? '—'}</td><td>${v.forma ?? '—'}</td><td class="r">${money(v.desconto ?? 0)}</td><td class="r">${money(v.total)}</td><td class="r dev">${dev}</td></tr>`
    }).join('')
    const total = vendas.reduce((s, v) => s + v.total, 0)
    const devTotal = vendas.reduce((s, v) => s + v.devolvido, 0)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Vendas</title><style>
      @page { size: A4 landscape; margin: 14mm; }
      body { font-family: Arial, sans-serif; font-size: 12px; color: #000; }
      h1 { text-align: center; font-size: 18px; margin: 0 0 2px; }
      .sub { text-align: center; font-size: 12px; margin: 0 0 14px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #ccc; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; font-weight: bold; }
      .r { text-align: right; white-space: nowrap; }
      .dev { color: #b00; }
      .tot { font-weight: bold; border-top: 2px solid #000; }
      .foot { margin-top: 14px; font-size: 12px; }
    </style></head><body>
      <h1>Relatório de Vendas</h1>
      <p class="sub">Período: ${dt(de)} a ${dt(ate)}</p>
      <table>
        <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Forma</th><th class="r">Desconto</th><th class="r">Total</th><th class="r">Devolução</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <p class="foot">Total vendas: <b>${money(total)}</b> · Total devoluções: <b class="dev">${money(devTotal)}</b> · Líquido: <b>${money(total - devTotal)}</b></p>
    </body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html); w.document.close()
    setTimeout(() => w.print(), 300)
  }

  return (
    <button onClick={imprimir} type="button"
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
      🖨️ Imprimir (PDF)
    </button>
  )
}
