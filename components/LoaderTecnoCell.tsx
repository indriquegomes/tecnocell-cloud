// Tela de carregamento da marca — o ícone da TecnoCell quica pela caixa (estilo
// "DVD" que o Vitor gostou no Uiverse), com um brilho que vai do azul pro laranja
// da marca. Pra ele (e a equipe) saberem que está carregando, com a nossa cara.
// CSS puro, sem lib. Respeita quem pede menos movimento (prefers-reduced-motion).
export function LoaderTecnoCell({ texto = 'Carregando' }: { texto?: string }) {
  return (
    <div className="tc-load">
      <style>{`
        .tc-load {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 1.4rem; min-height: 60vh; width: 100%;
        }
        /* a "quadra" onde o ícone quica — cantos bem arredondados, no brand */
        .tc-load-quadra {
          position: relative; width: 240px; height: 150px;
          border-radius: 28px;
          background: linear-gradient(160deg, #f3f8fc, #eaf2f9);
          box-shadow: inset 0 1px 0 #fff, 0 10px 30px -12px rgba(27,108,168,0.25);
          overflow: hidden;
        }
        .tc-load-icon {
          position: absolute; width: 52px; height: 52px; object-fit: contain;
          animation: tc-quica 3.4s infinite cubic-bezier(0.45,0,0.55,1),
                     tc-brilho 3.4s infinite ease-in-out;
        }
        /* quica pelos 4 cantos da quadra e volta — o efeito DVD */
        @keyframes tc-quica {
          0%   { transform: translate(14px, 14px)  rotate(0deg); }
          25%  { transform: translate(174px, 14px) rotate(6deg); }
          50%  { transform: translate(174px, 84px) rotate(0deg); }
          75%  { transform: translate(14px, 84px)  rotate(-6deg); }
          100% { transform: translate(14px, 14px)  rotate(0deg); }
        }
        /* brilho azul → laranja → azul, acompanhando o quicar */
        @keyframes tc-brilho {
          0%   { filter: drop-shadow(0 6px 14px rgba(27,108,168,0.45)); }
          50%  { filter: drop-shadow(0 6px 16px rgba(244,121,32,0.55)); }
          100% { filter: drop-shadow(0 6px 14px rgba(27,108,168,0.45)); }
        }
        .tc-load-nome { font-size: 1.15rem; font-weight: 800; letter-spacing: -0.01em; }
        .tc-load-nome b { color: #1B6CA8; }
        .tc-load-nome i { color: #F47920; font-style: normal; }
        .tc-load-txt { font-size: 0.85rem; color: #9ca3af; font-weight: 500; }
        .tc-load-txt::after { content: ''; animation: tc-pontos 1.4s steps(1) infinite; }
        @keyframes tc-pontos { 0%{content:''} 25%{content:'.'} 50%{content:'..'} 75%{content:'...'} 100%{content:''} }
        @media (prefers-reduced-motion: reduce) {
          .tc-load-icon { animation: none; transform: translate(94px, 49px); }
          .tc-load-txt::after { content: '...'; animation: none; }
        }
      `}</style>
      <div className="tc-load-quadra">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tecnocell-icon.png" alt="" className="tc-load-icon" />
      </div>
      <div className="tc-load-nome"><b>Tecno</b><i>Cell</i></div>
      <div className="tc-load-txt">{texto}</div>
    </div>
  )
}
