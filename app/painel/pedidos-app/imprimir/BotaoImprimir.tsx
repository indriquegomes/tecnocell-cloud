'use client'

export function BotaoImprimir() {
  function imprimir() {
    const ficha = document.getElementById('ficha-pedido')
    if (!ficha) return
    // Papel de 80 mm com altura suficiente; "80mm auto" não é um size CSS válido.
    const altura = Math.max(100, Math.ceil(ficha.scrollHeight * 25.4 / 96) + 12)
    const estilo = document.createElement('style')
    estilo.textContent = `@page { size: 80mm ${altura}mm; margin: 4mm; }`
    document.head.appendChild(estilo)
    try { window.print() } finally { estilo.remove() }
  }
  return <button onClick={imprimir} className="min-h-11 rounded-lg bg-blue-700 px-4 text-white print:hidden">Imprimir / reimprimir</button>
}
