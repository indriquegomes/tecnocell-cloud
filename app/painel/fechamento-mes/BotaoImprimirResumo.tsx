'use client'

// Botão de imprimir o resumo na folha inteira (A4). Usa @page A4 com margem de
// 10mm, que é o formato em que o dono e a contabilidade leem o fechamento.
export function BotaoImprimirResumo() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden min-h-10 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
    >
      🖨️ Imprimir resumo
    </button>
  )
}
