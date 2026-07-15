'use client'

// Atalhos rápidos de período — clicou, JÁ recalcula (o Vitor: "clico em 7 e 15 e
// não vai nada"). Antes o botão só mudava as datas e ficava esperando o "Calcular";
// agora ele preenche as datas E submete o form na hora.
export function AtalhosPeriodo() {
  const aplicar = (dias: number) => {
    // navega direto pra URL com as novas datas — preserva prazo/cobertura/categoria/
    // depósito que já estão na URL. Setar o value do input date não pegava no submit.
    const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const hoje = new Date()
    const inicio = new Date(); inicio.setDate(inicio.getDate() - (dias - 1))
    const url = new URL(window.location.href)
    url.searchParams.set('ate', fmt(hoje))
    url.searchParams.set('de', fmt(inicio))
    window.location.href = url.toString()
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
