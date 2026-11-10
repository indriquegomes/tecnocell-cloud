"use client";

import { useEffect, useRef, useState } from "react";

type Faixa = { nome: string; valor: number; premio?: number };

type Props = {
  /** Posição do ponteiro na escada (0-100): cada degrau ocupa um quarto do arco. */
  pct: number;
  /** Percentual real da meta do topo — é o número grande no centro. */
  pctReal?: number;
  rotulo?: string;
  /** Degraus da meta do mês, em ordem crescente. Cada um vira um símbolo no arco. */
  faixas?: Faixa[];
  /** Venda bruta da loja no mês — serve para dizer quanto falta para a próxima meta. */
  vendido?: number;
  /** Dias de trabalho que faltam no mês — divisor da meta diária de cada etapa. */
  diasRestantes?: number;
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

// Cada degrau tem um símbolo próprio: pedra colorida e, no último, a coroa.
const SIMBOLOS: Record<string, { cor: string; corFraca: string }> = {
  granada: { cor: "#ef4444", corFraca: "#7f1d1d" },
  esmeralda: { cor: "#22c55e", corFraca: "#14532d" },
  diamante: { cor: "#38bdf8", corFraca: "#0c4a6e" },
  joalheria: { cor: "#fbbf24", corFraca: "#78350f" },
};
const estiloDoSimbolo = (nome: string | undefined) =>
  SIMBOLOS[(nome ?? "").trim().toLowerCase()] ?? { cor: "#94a3b8", corFraca: "#334155" };

// Posição de cada símbolo no arco: degraus IGUAIS (25%, 50%, 75%, 100%).
// A escada real é densa (uma meta fica a 6-8% da outra), então posição
// proporcional empilharia as quatro na ponta e o ponteiro não "caminharia".
const passoDoDegrau = (indice: number, total: number) => ((indice + 1) / total) * 100;

function Simbolo({
  nome,
  x,
  y,
  conquistado,
}: {
  nome: string;
  x: number;
  y: number;
  conquistado: boolean;
}) {
  const { cor } = estiloDoSimbolo(nome);
  const chave = (nome ?? "").trim().toLowerCase();
  const ehCoroa = chave === "joalheria";

  return (
    <g opacity={conquistado ? 1 : 0.32}>
      <circle
        cx={x}
        cy={y}
        r="15"
        fill="#0d1117"
        stroke={cor}
        strokeWidth={conquistado ? 2.5 : 1.5}
      />
      {ehCoroa ? (
        <path
          d={`M ${x - 8} ${y + 5} L ${x - 8} ${y - 3} L ${x - 3} ${y + 1} L ${x} ${y - 6} L ${x + 3} ${y + 1} L ${x + 8} ${y - 3} L ${x + 8} ${y + 5} Z`}
          fill={cor}
        />
      ) : (
        <path
          d={`M ${x} ${y - 8} L ${x + 7} ${y - 1} L ${x + 4} ${y + 7} L ${x - 4} ${y + 7} L ${x - 7} ${y - 1} Z`}
          fill={cor}
        />
      )}
    </g>
  );
}

export default function VelocimetroMeta({
  pct,
  pctReal,
  rotulo = "META DA EQUIPE",
  faixas = [],
  vendido = 0,
  diasRestantes = 0,
}: Props) {
  const [valor, setValor] = useState(0);
  const valorAtual = useRef(0);
  const entrou = useRef(true);
  const frameRef = useRef(0);

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

    // ida: começa rápida e desacelera (fica boa no sweep até 100)
    const suaveSair = (t: number) => 1 - Math.pow(1 - t, 4);
    // volta: acelera (a "acelerada") e depois solta o acelerador (coast) —
    // ease-in-out quintico, burst mais marcado no meio
    const acelerar = (t: number) =>
      t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

    const animarAte = (
      alvo: number,
      duracao: number,
      aoTerminar?: () => void,
      suavizar: (t: number) => number = suaveSair,
    ) => {
      const de = valorAtual.current;
      const inicio = performance.now();

      const tick = (tempo: number) => {
        const progresso = Math.min((tempo - inicio) / duracao, 1);
        const v = Math.max(0, Math.min(100, de + (alvo - de) * suavizar(progresso)));

        valorAtual.current = v;
        setValor(v);

        if (progresso < 1) {
          frameRef.current = requestAnimationFrame(tick);
        } else {
          valorAtual.current = alvo;
          setValor(alvo);
          if (aoTerminar) aoTerminar();
        }
      };

      frameRef.current = requestAnimationFrame(tick);
    };

    if (entrou.current) {
      entrou.current = false;
      // Entrada: varre até o máximo (rápido) e volta devagar com empacada.
      animarAte(100, 900, () => animarAte(destino, 6000, undefined, acelerar));
    } else {
      animarAte(destino, 1600);
    }

    return () => cancelAnimationFrame(frameRef.current);
  }, [pct]);

  const percentual = Math.round(valor);
  const percentualReal = Math.round(pctReal ?? pct);
  const angulo = 180 - valor * 1.8;

  const ponteiro = polarToCartesian(180, 180, 128, angulo);
  const etiqueta = polarToCartesian(180, 180, 148, angulo);

  const degraus = [...faixas].sort((a, b) => a.valor - b.valor);
  const proxima = degraus.find((f) => f.valor > vendido) ?? null;
  const faltaProxima = proxima ? Math.max(0, proxima.valor - vendido) : 0;
  const fmtBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

          {/* Símbolos das metas, em degraus iguais */}
          {degraus.map((f, i) => {
            const posicao = passoDoDegrau(i, degraus.length);
            const angle = 180 - posicao * 1.8;
            const p = polarToCartesian(180, 180, 135, angle);
            return (
              <Simbolo
                key={`${f.nome}-${i}`}
                nome={f.nome}
                x={p.x}
                y={p.y}
                conquistado={valor >= posicao - 0.5}
              />
            );
          })}

          {/* Ponteiro */}
          <line
            x1="180"
            y1="180"
            x2={ponteiro.x}
            y2={ponteiro.y}
            stroke="#ffffff"
            strokeWidth="5"
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
              {percentualReal}%
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
              {percentualReal}
            </span>
            <span className="ml-1 text-xl font-bold text-gray-400">
              %
            </span>
          </div>

          <span className="mt-0.5 text-xs font-bold tracking-[0.35em] text-gray-500">
            DA META DO TOPO
          </span>
        </div>
      </div>

      {/* Informação inferior */}
      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-500">
          {proxima ? "PRÓXIMA META" : "TODAS AS METAS CONQUISTADAS"}
        </p>

        <p className="mt-1 text-lg font-extrabold text-white">
          {proxima ? (
            <>
              {proxima.nome}
              <span className="ml-1 text-sm font-semibold text-gray-400">
                — faltam {fmtBRL(faltaProxima)}
              </span>
            </>
          ) : (
            "Parabéns! 🎉"
          )}
        </p>
      </div>

      {/* Meta diária de cada etapa: (valor da etapa − vendido) ÷ dias que faltam.
          Recalcula todo dia — é o ritmo necessário, não um número fixo. */}
      {degraus.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.2em] text-gray-500">META DIÁRIA POR ETAPA</p>
            <p className="text-[10px] font-semibold text-gray-500">
              {diasRestantes > 0 ? `${diasRestantes} dia${diasRestantes === 1 ? "" : "s"} de trabalho` : "sem dias restantes"}
            </p>
          </div>

          <div className="mt-2 space-y-1.5">
            {degraus.map((f, i) => {
              const alcancada = vendido >= f.valor;
              const falta = Math.max(0, f.valor - vendido);
              const porDia = diasRestantes > 0 ? falta / diasRestantes : 0;
              const estilo = estiloDoSimbolo(f.nome);
              return (
                <div key={`${f.nome}-${i}`} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: alcancada ? estilo.cor : estilo.corFraca }}
                    />
                    <span className={`truncate text-xs ${alcancada ? "font-semibold text-white" : "text-gray-300"}`}>
                      {f.nome}
                    </span>
                  </div>
                  <span className="shrink-0 text-right text-xs tabular-nums">
                    {alcancada ? (
                      <span className="font-semibold text-emerald-400">conquistada</span>
                    ) : (
                      <>
                        <span className="font-semibold text-white">{fmtBRL(porDia)}</span>
                        <span className="text-gray-500"> /dia</span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
