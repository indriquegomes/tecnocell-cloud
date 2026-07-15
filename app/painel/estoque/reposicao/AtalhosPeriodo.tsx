'use client'

// Atalhos rápidos de período — preenchem os campos de data "de/até" sem digitar.
// O Vitor pediu personalizável (datas livres) + queria os botões 7/15/30; aqui
// tem os dois: os botões só ajustam as datas, e o "Calcular" continua sendo o form.
export function AtalhosPeriodo() {
  const aplicar = (dias: number) => {
    const form = document.querySelector('form') as HTMLFormElement | null
    if (!form) return
    const ate = form.querySelector<HTMLInputElement>('input[name="ate"]')
    const de = form.querySelector<HTMLInputElement>('input[name="de"]')
    if (!ate || !de) return
    const hoje = new Date()
    const inicio = new Date(); inicio.setDate(inicio.getDate() - (dias - 1))
    ate.value = hoje.toISOString().slice(0, 10)
    de.value = inicio.toISOString().slice(0, 10)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-gray-400">Atalho:</span>
      {[7, 15, 30, 60, 90].map((d) => (
        <button key={d} type="button" onClick={() => aplicar(d)}
          className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:border-blue-300 hover:text-blue-700 transition">
          {d} dias
        </button>
      ))}
    </div>
  )
}
