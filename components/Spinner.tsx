// Spinner padrão do sistema — símbolo girando pra indicar carregamento.
// Use em qualquer botão/ação assíncrona (onClick + await) junto do texto "...ando".
// (Forms com <SubmitButton> já mostram este mesmo spinner automaticamente.)
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  )
}
