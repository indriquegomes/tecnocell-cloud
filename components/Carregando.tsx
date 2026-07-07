// Indicador de carregamento óbvio: spinner azul da marca + "Carregando...".
// Usado nos loading.tsx (aparece sozinho enquanto a tela carrega).
export function Carregando({ texto = 'Carregando...' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <svg className="h-6 w-6 animate-spin text-[#1B6CA8]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
      </svg>
      <span className="text-sm font-semibold text-gray-600">{texto}</span>
    </div>
  )
}
