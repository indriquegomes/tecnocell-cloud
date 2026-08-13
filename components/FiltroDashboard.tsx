'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import { beginNav, endNav } from '@/components/NavProgress'

// Filtro do dashboard: período + loja.
//
// Pedido da Isa: "mostrar por mês, ano e selecionar a loja ali em 'todas as empresas'".
// O motivo real: o ranking de vendedores mostra "ATENDIMENTO PETRÓPOLIS 01" no topo
// porque 30 dias contêm ~27 dias de SIGE (login por LOJA) contra ~3 de TecnoCell.
// Escolhendo "Esta semana", ela vê MARIANA / MARIA EDUARDA / ISABELA / BRUNNA.
//
// Navega direto (sem botão "aplicar"): escolheu, já mostra.

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function FiltroDashboard({
  de, ate, loja, lojas,
}: {
  de: string
  ate: string
  loja: string
  lojas: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Navega mostrando a barra de carregamento do topo. O filtro só troca a QUERY
  // (mesmo pathname), então a barra não fecharia sozinha — beginNav/endNav a
  // controlam pelo estado da transição. (Reclamação da Isa: "clica e não acontece
  // nada visível enquanto carrega".)
  const irUrl = (url: string) => { beginNav(); startTransition(() => router.push(url)) }
  useEffect(() => { if (!pending) endNav() }, [pending])

  const ir = (novo: Partial<{ de: string; ate: string; loja: string }>) => {
    const q = new URLSearchParams()
    const d = novo.de ?? de, a = novo.ate ?? ate, l = novo.loja ?? loja
    q.set('de', d); q.set('ate', a)
    if (l) q.set('loja', l)
    irUrl('/painel?' + q.toString())
  }

  // datas em America/Sao_Paulo (o resto do sistema usa o mesmo fuso)
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const iso = (d: Date) => d.toLocaleDateString('en-CA')

  const mesAtual = Number(de.slice(5, 7)) - 1
  const anoAtual = Number(de.slice(0, 4))
  const anos = [hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2]

  const irMes = (m: number, y: number) => {
    const ini = new Date(y, m, 1)
    const fim = new Date(y, m + 1, 0)
    ir({ de: iso(ini), ate: iso(fim > hoje ? hoje : fim) })
  }

  const atalho = (dias: number) => {
    const d = new Date(hoje); d.setDate(d.getDate() - (dias - 1))
    ir({ de: iso(d), ate: iso(hoje) })
  }

  const btn = (ativo: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      ativo ? 'bg-[#1B6CA8] text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
    }`

  // Qual atalho está ativo AGORA. Antes "Esta semana" e "Este mês" eram btn(false)
  // fixo — nunca acendiam, escolhesse o que escolhesse. O usuário ficava sem saber
  // em que período estava.
  const hojeIso = iso(hoje)
  const diasAtras = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() - (n - 1)); return iso(d) }
  const primeiroDoMes = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const ultimoDoMes = iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))
  const ativoHoje   = de === hojeIso && ate === hojeIso
  const ativoSemana = de === diasAtras(7) && ate === hojeIso
  // "Este mês" é o PADRÃO: acende quando de=1º do mês e ate=hoje (mês correndo) ou último dia
  const ativoMes    = de === primeiroDoMes && (ate === hojeIso || ate === ultimoDoMes)
  const ativo30     = de === diasAtras(30) && ate === hojeIso
  // um mês qualquer escolhido nos selects (que não seja o atalho "Este mês")
  const ativoMesSel = !ativoMes && de.slice(8) === '01'

  const selCls = (ativo: boolean) =>
    `rounded-lg border px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#1B6CA8] transition ${
      ativo ? 'border-[#1B6CA8] bg-[#1B6CA8]/10 text-[#1B6CA8] font-semibold' : 'border-gray-200 bg-white text-gray-700'
    }`

  return (
    <div
      aria-busy={pending}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2 transition-opacity"
      style={pending ? { opacity: 0.55, pointerEvents: 'none' } : undefined}
    >
      {/* "Hoje" é o atalho que a Isa mais usa. O histórico importado que poluía o
          ranking de vendedoras (login por LOJA, não por pessoa) foi removido em
          13/08/2026 — agora qualquer janela mostra vendedora de verdade. */}
      <button type="button" onClick={() => atalho(1)} className={btn(ativoHoje)}>Hoje</button>
      <button type="button" onClick={() => atalho(7)} className={btn(ativoSemana)}>Esta semana</button>
      <button type="button" onClick={() => irMes(hoje.getMonth(), hoje.getFullYear())} className={btn(ativoMes)}>Este mês</button>
      <button type="button" onClick={() => atalho(30)} className={btn(ativo30)}>30 dias</button>

      <span className="mx-1 h-4 w-px bg-gray-200" />

      {/* Quando um mês está escolhido (e não é o atalho "Este mês"), os selects ficam
          destacados — senão nada na barra indica em que período o usuário está. */}
      <select
        value={mesAtual}
        onChange={(e) => irMes(Number(e.target.value), anoAtual)}
        className={selCls(ativoMesSel)}
      >
        {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
      </select>

      <select
        value={anoAtual}
        onChange={(e) => irMes(mesAtual, Number(e.target.value))}
        className={selCls(ativoMesSel)}
      >
        {anos.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>

      <span className="mx-1 h-4 w-px bg-gray-200" />

      <select
        value={loja}
        onChange={(e) => ir({ loja: e.target.value })}
        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]"
      >
        <option value="">Todas as lojas</option>
        {lojas.map((l) => <option key={l.id} value={l.nome}>{l.nome}</option>)}
      </select>
    </div>
  )
}
