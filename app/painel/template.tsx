// Template = remonta a cada navegação entre telas do painel (ver doc do Next:
// file-conventions/template). Damos um fade-in suave no conteúdo a cada troca
// de página → sensação de fluidez. CSS puro (.animate-fade-in-up no globals),
// respeita prefers-reduced-motion. Não envolve a Sidebar, só o conteúdo.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in-up">{children}</div>
}
