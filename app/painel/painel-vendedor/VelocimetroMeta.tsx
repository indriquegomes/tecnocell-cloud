"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  pct: number;
  rotulo?: string;
  falta?: string;
};

const clamp = (value: number) => Math.min(100, Math.max(0, value));

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angle: number
) {
  const radians = (angle * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(radians),
    y: cy - radius * Math.sin(radians),
  };
}

function arcPath(radius: number, pct: number) {
  const start = polarToCartesian(180, 180, radius, 180);
  const end = polarToCartesian(180, 180, radius, 180 - pct * 1.8);

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

export default function VelocimetroMeta({
  pct,
  rotulo = "META DA EQUIPE",
  falta,
}: Props) {
  const [valor, setValor] = useState(0);
  const valorAtual = useRef(0);

  useEffect(() => {
    const destino = clamp(pct);

    const movimentoReduzido = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (movimentoReduzido) {
      valorAtual.current = destino;
      setValor(destino);
      return;
    }

    const inicio = valorAtual.current;
    const duracao = 1600;
    let frame = 0;
    let inicioAnimacao: number | null = null;

    const animar = (tempo: number) => {
      if (inicioAnimacao === null) inicioAnimacao = tempo;

      const progresso = Math.min(
        (tempo - inicioAnimacao) / duracao,
        1
      );

      // Começa rápido e desacelera suavemente no final.
      const suavizacao = 1 - Math.pow(1 - progresso, 4);

      const novoValor = inicio + (destino - inicio) * suavizacao;

      valorAtual.current = novoValor;
      setValor(novoValor);

      if (progresso < 1) {
        frame = requestAnimationFrame(animar);
      } else {
        valorAtual.current = destino;
        setValor(destino);
      }
    };

    frame = requestAnimationFrame(animar);

    return () => cancelAnimationFrame(frame);
  }, [pct]);

  const percentual = Math.round(valor);
  const angulo = 180 - valor * 1.8;

  const ponteiro = polarToCartesian(180, 180, 112, angulo);
  const etiqueta = polarToCartesian(180, 180, 118, angulo);

  const marcacoes = [0, 20, 40, 60, 80, 100];

  return (
    <div className="w-full max-w-[480px] rounded-3xl border border-white/10 bg-[#0d1117] p-5 text-white shadow-2xl">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-bold tracking-[0.22em] text-gray-400">
          {rotulo}
        </span>

        <span className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-[10px] font-bold tracking-wider text-green-400">
          ↑ RUMO À META
        </span>
      </div>

      <div className="relative mx-auto mt-3 w-full">
        <svg
          viewBox="0 0 360 230"
          className="w-full overflow-visible"
          role="img"
          aria-label={`Meta atingida: ${percentual}%`}
        >
          <defs>
            <linearGradient id="metaGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="30%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#facc15" />
              <stop offset="75%" stopColor="#84cc16" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>

            <filter id="needleGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Fundo do velocímetro */}
          <path
            d={arcPath(135, 100)}
            fill="none"
            stroke="#252d38"
            strokeWidth="17"
            strokeLinecap="round"
          />

          {/* Arco colorido */}
          <path
            d={arcPath(135, 100)}
            fill="none"
            stroke="url(#metaGradient)"
            strokeWidth="17"
            strokeLinecap="round"
          />

          {/* Marcações e números */}
          {marcacoes.map((numero) => {
            const angle = 180 - numero * 1.8;
            const externo = polarToCartesian(180, 180, 157, angle);
            const interno = polarToCartesian(180, 180, 146, angle);
            const texto = polarToCartesian(180, 180, 177, angle);

            return (
              <g key={numero}>
                <line
                  x1={interno.x}
                  y1={interno.y}
                  x2={externo.x}
                  y2={externo.y}
                  stroke="#aab3c0"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                <text
                  x={texto.x}
                  y={texto.y}
                  fill="#f3f4f6"
                  fontSize="12"
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {numero}
                </text>
              </g>
            );
          })}

          {/* Ponteiro */}
          <line
            x1="180"
            y1="180"
            x2={ponteiro.x}
            y2={ponteiro.y}
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            filter="url(#needleGlow)"
          />

          {/* Ponta do ponteiro */}
          <circle
            cx={ponteiro.x}
            cy={ponteiro.y}
            r="5"
            fill="white"
          />

          {/* Etiqueta percentual na ponta */}
          <g>
            <rect
              x={Math.max(5, Math.min(295, etiqueta.x - 25))}
              y={Math.max(5, etiqueta.y - 14)}
              width="50"
              height="25"
              rx="7"
              fill="#ffffff"
            />
            <text
              x={Math.max(30, Math.min(320, etiqueta.x))}
              y={Math.max(22, etiqueta.y + 3)}
              fill="#0d1117"
              fontSize="12"
              fontWeight="900"
              textAnchor="middle"
            >
              {percentual}%
            </text>
          </g>

          {/* Pivô central */}
          <circle cx="180" cy="180" r="12" fill="#ffffff" />
          <circle cx="180" cy="180" r="5" fill="#64748b" />
        </svg>

        {/* Percentual principal */}
        <div className="flex flex-col items-center">
          <div className="flex items-baseline">
            <span className="text-5xl font-black tracking-tighter tabular-nums text-white drop-shadow-lg">
              {percentual}
            </span>
            <span className="ml-1 text-xl font-bold text-gray-400">
              %
            </span>
          </div>

          <span className="mt-0.5 text-xs font-bold tracking-[0.35em] text-gray-500">
            DA META
          </span>
        </div>
      </div>

      {/* Informação inferior */}
      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-500">
          {percentual >= 100 ? "META ALCANÇADA!" : "FALTA PARA A META"}
        </p>

        <p className="mt-1 text-lg font-extrabold text-white">
          {percentual >= 100 ? "Parabéns! 🎉" : falta || "Continue acelerando!"}
        </p>
      </div>
    </div>
  );
}
