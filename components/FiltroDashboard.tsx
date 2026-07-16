'use client'

import { useRouter } from 'next/navigation'

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
  de, ate, loja, lojas, ehPadrao,
}: {
  de: string
  ate: string
  loja: string
  lojas: { id: string; nome: string }[]
  ehPadrao: boolean
}) {
  const router = useRouter()

  const ir = (novo: Partial<{ de: string; ate: string; loja: string }>) => {
    const q = new URLSearchParams()
    const d = novo.de ?? de, a = novo.ate ?? ate, l = novo.loja ?? loja
    q.set('de', d); q.set('ate', a)
    if (l) q.set('loja', l)
    router.push('/painel?' + q.toString())
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

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2">
      {/* "Hoje" é o atalho que a Isa realmente precisa: como o SIGE parou, só o dia
          de hoje mostra as vendedoras de verdade (Mariana, Maria Eduarda, Brunna)
          no ranking. Qualquer janela maior ainda é dominada pelo histórico do SIGE,
          que só tinha login por LOJA ("ATENDIMENTO PETRÓPOLIS 01"). */}
      <button type="button" onClick={() => atalho(1)} className={btn(!ehPadrao && de === ate && ate === iso(hoje))}>Hoje</button>
      <button type="button" onClick={() => atalho(7)} className={btn(false)}>Esta semana</button>
      <button type="button" onClick={() => irMes(hoje.getMonth(), hoje.getFullYear())} className={btn(false)}>Este mês</button>
      <button type="button" onClick={() => router.push('/painel')} className={btn(ehPadrao)}>30 dias</button>

      <span className="mx-1 h-4 w-px bg-gray-200" />

      <select
        value={mesAtual}
        onChange={(e) => irMes(Number(e.target.value), anoAtual)}
        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]"
      >
        {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
      </select>

      <select
        value={anoAtual}
        onChange={(e) => irMes(mesAtual, Number(e.target.value))}
        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]"
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
