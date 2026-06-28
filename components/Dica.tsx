export function Dica({ texto, lado = 'cima' }: { texto: string; lado?: 'cima' | 'baixo' | 'direita' | 'esquerda' }) {
  const posicao = {
    cima:     'bottom-full left-1/2 -translate-x-1/2 mb-2',
    baixo:    'top-full  left-1/2 -translate-x-1/2 mt-2',
    direita:  'left-full top-1/2  -translate-y-1/2 ml-2',
    esquerda: 'right-full top-1/2 -translate-y-1/2 mr-2',
  }[lado]

  const seta = {
    cima:     'top-full  left-1/2 -translate-x-1/2 border-t-gray-800 border-b-transparent border-l-transparent border-r-transparent',
    baixo:    'bottom-full left-1/2 -translate-x-1/2 border-b-gray-800 border-t-transparent border-l-transparent border-r-transparent',
    direita:  'right-full top-1/2  -translate-y-1/2 border-r-gray-800 border-l-transparent border-t-transparent border-b-transparent',
    esquerda: 'left-full  top-1/2  -translate-y-1/2 border-l-gray-800 border-r-transparent border-t-transparent border-b-transparent',
  }[lado]

  return (
    <span className="group relative inline-flex items-center">
      <span className="inline-flex h-[18px] w-[18px] cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-400 transition hover:border-blue-400 hover:text-blue-500">
        ?
      </span>
      <span className={`pointer-events-none absolute z-50 w-max max-w-xs rounded-lg bg-gray-800 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 ${posicao}`}>
        {texto}
        <span className={`absolute border-4 ${seta}`} />
      </span>
    </span>
  )
}
