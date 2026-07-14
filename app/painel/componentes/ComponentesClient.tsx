'use client'

import { useState } from 'react'
import { Spinner } from '@/components/Spinner'

// Portfólio de UI — o design system do TecnoCell. Cada bloco é uma referência viva:
// o que está aqui é o que se usa no resto do sistema. Todo botão herda o feedback de
// toque global (afunda ao apertar — funciona no tablet do PDV).

function Secao({ titulo, desc, children }: { titulo: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-bold text-gray-800">{titulo}</h3>
      {desc && <p className="mt-0.5 mb-4 text-xs text-gray-400">{desc}</p>}
      <div className={desc ? '' : 'mt-4'}>{children}</div>
    </section>
  )
}

// Botão de CTA com a seta que desliza — a que o Vitor gostou, adaptada ao brand e
// ligada ao TOQUE (:active), não só hover, pra funcionar no tablet.
function BotaoSeta({ children, cor = '#1B6CA8' }: { children: React.ReactNode; cor?: string }) {
  return (
    <button className="tc-cta group" style={{ ['--tc-cta' as string]: cor }}>
      {children}
      <span className="tc-cta-arrow" aria-hidden>
        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
          <path d="M2 8h10M9 5l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  )
}

export function ComponentesClient() {
  const [carregando, setCarregando] = useState(false)
  const [tipoBadge, setTipoBadge] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <style>{`
        /* CTA com seta — o efeito que o Vitor gostou (Uiverse), no brand e no TOQUE.
           A seta esconde a ponta e revela ao apertar/passar. transform no :active
           funciona no dedo do tablet; :hover é so bonus no desktop. */
        .tc-cta {
          display: inline-flex; align-items: center; gap: 0.5em;
          border: 0; border-radius: 0.75rem; padding: 0.65em 1.3em;
          background: var(--tc-cta); color: #fff; font-weight: 600; font-size: 0.9rem;
          transition: background 0.15s, box-shadow 0.15s;
        }
        .tc-cta:hover { box-shadow: 0 4px 14px -4px var(--tc-cta); filter: brightness(1.05); }
        .tc-cta-arrow {
          display: inline-flex; overflow: hidden; width: 0;
          transition: width 0.22s ease;
        }
        .tc-cta:hover .tc-cta-arrow, .tc-cta:active .tc-cta-arrow { width: 1.1em; }
        @media (prefers-reduced-motion: reduce) {
          .tc-cta-arrow { width: 1.1em; transition: none; }
        }
      `}</style>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">Componentes</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          O design system do TecnoCell numa tela só. É a referência viva — o que está aqui é o que se usa no resto do sistema.
          <b className="text-gray-700"> Aperte qualquer botão: todos afundam no toque</b> (funciona no tablet do PDV).
        </p>
      </div>

      <Secao titulo="Cores do brand" desc="60% branco · 30% azul · 10% laranja. É a base de tudo.">
        <div className="flex flex-wrap gap-3">
          {[
            { nome: 'Azul', hex: '#1B6CA8' },
            { nome: 'Laranja', hex: '#F47920' },
            { nome: 'Verde (ok)', hex: '#16a34a' },
            { nome: 'Vermelho (alerta)', hex: '#dc2626' },
            { nome: 'Âmbar (atenção)', hex: '#d97706' },
            { nome: 'Cinza texto', hex: '#374151' },
          ].map((c) => (
            <div key={c.hex} className="text-center">
              <div className="h-16 w-24 rounded-xl shadow-sm" style={{ background: c.hex }} />
              <p className="mt-1 text-xs font-medium text-gray-700">{c.nome}</p>
              <p className="font-mono text-[10px] text-gray-400">{c.hex}</p>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Botões" desc="Aperte qualquer um — o feedback de toque é global. A cor diz a intenção.">
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-xl bg-[#1B6CA8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#155a8c]">Primário (salvar, confirmar)</button>
          <button className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700">Positivo (finalizar venda)</button>
          <button className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700">Destrutivo (excluir)</button>
          <button className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50">Secundário (cancelar)</button>
          <button disabled className="rounded-xl bg-gray-300 px-5 py-2.5 text-sm font-semibold text-white">Desabilitado (não afunda)</button>
        </div>
      </Secao>

      <Secao titulo="Botão com seta (CTA)" desc="O efeito que você gostou (Uiverse) — no brand e ligado ao TOQUE, não só hover. Pros botões principais.">
        <div className="flex flex-wrap items-center gap-3">
          <BotaoSeta>Finalizar Venda</BotaoSeta>
          <BotaoSeta cor="#16a34a">Abrir Caixa</BotaoSeta>
          <BotaoSeta cor="#F47920">Avançar</BotaoSeta>
        </div>
        <p className="mt-3 text-xs text-gray-400">Aperte no celular/tablet: a seta aparece no toque. No PC também sai no hover.</p>
      </Secao>

      <Secao titulo="Estado de carregando" desc="A resposta pra 'cliquei ou não?'. É isto que tira a dúvida no balcão — não a animação.">
        <button
          onClick={() => { setCarregando(true); setTimeout(() => setCarregando(false), 1600) }}
          disabled={carregando}
          className="flex items-center gap-2 rounded-xl bg-[#1B6CA8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#155a8c] disabled:opacity-60"
        >
          {carregando && <Spinner />}{carregando ? 'Salvando...' : 'Clique pra ver o spinner'}
        </button>
      </Secao>

      <Secao titulo="Badges / status" desc="Encode o estado na FORMA e na cor, não só no texto. Lê de relance.">
        <div className="flex flex-wrap gap-2">
          {[
            { label: '✓ Concluída', cor: 'bg-green-50 text-green-700 border-green-200' },
            { label: '⏳ Pendente', cor: 'bg-amber-50 text-amber-700 border-amber-200' },
            { label: '✕ Cancelada', cor: 'bg-red-50 text-red-700 border-red-200' },
            { label: '🏷️ Fiado', cor: 'bg-orange-50 text-orange-700 border-orange-200' },
            { label: 'Rascunho', cor: 'bg-gray-100 text-gray-500 border-gray-200' },
            { label: 'Master', cor: 'bg-purple-50 text-purple-700 border-purple-200' },
          ].map((b) => (
            <button
              key={b.label}
              onClick={() => setTipoBadge(tipoBadge === b.label ? null : b.label)}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${b.cor} ${tipoBadge === b.label ? 'ring-2 ring-offset-1' : ''}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </Secao>

      <Secao titulo="Campos de formulário" desc="A classe .field padroniza toda entrada. Foco em azul do brand.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Texto</label>
            <input className="field" placeholder="Digite algo…" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Seleção</label>
            <select className="field"><option>Opção A</option><option>Opção B</option></select>
          </div>
        </div>
      </Secao>

      <Secao titulo="Cards / KPI" desc="O padrão dos números do dashboard.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { rotulo: 'Faturamento', valor: 'R$ 192.062', cor: 'text-[#1B6CA8]' },
            { rotulo: 'Vendas', valor: '2.641', cor: 'text-gray-900' },
            { rotulo: 'Ticket médio', valor: 'R$ 88,32', cor: 'text-gray-900' },
          ].map((k) => (
            <div key={k.rotulo} className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{k.rotulo}</p>
              <p className={`mt-1 text-xl font-bold ${k.cor}`}>{k.valor}</p>
            </div>
          ))}
        </div>
      </Secao>

      <p className="text-center text-xs text-gray-400">
        Fonte da verdade: <span className="font-mono">app/globals.css</span> (feedback de toque) e as classes do brand. Adicione aqui todo componente novo que virar padrão.
      </p>
    </div>
  )
}
