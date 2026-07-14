'use client'

import { Spinner } from '@/components/Spinner'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { useActionState, useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  abrirCaixa,
  fecharCaixa,
  registrarReforco,
  registrarRetirada,
  type ActionState,
} from './actions'

// Token de auth lido do navegador e injetado no submit dos forms — cookies()
// vem vazio em server actions na Vercel, então o servidor valida este token.
const supabaseBrowser = createClient()
async function authToken(): Promise<string> {
  const { data } = await supabaseBrowser.auth.getSession()
  return data.session?.access_token ?? ''
}
// token carregado 1x no mount (ver useEffect no componente principal). withToken lê
// SÍNCRONO (sem await) — o dispatch do useActionState precisa acontecer dentro da
// transição do form; com await antes ele roda fora e a action NÃO salva.
let tokenCache = ''
function withToken(action: (fd: FormData) => void) {
  return (fd: FormData) => {
    fd.set('access_token', tokenCache)
    action(fd)
  }
}

// ─── Utilitários (módulo-level, não recriados a cada render) ────────────────
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const fmtHora = (d: string) =>
  new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

const FORMAS_INVALIDAS = ['Crédito Loja (Fiado)', 'Crediário', 'Crédito Loja']

// Cada tipo de pagamento tem uma cor fixa no fechamento — o operador aprende a
// reconhecer de relance (verde = gaveta, azul = PIX, roxo = maquininha, âmbar = dívida).
const iconeDoTipo = (t: string) =>
  t === 'dinheiro' ? '💵' : t === 'pix' ? '💠' : t.startsWith('cartao') ? '💳' : t === 'fiado' ? '🏷️' : '💰'
const corDoTipo = (t: string) =>
  t === 'dinheiro' ? 'bg-emerald-50 text-emerald-700'
  : t === 'pix' ? 'bg-blue-50 text-blue-700'
  : t.startsWith('cartao') ? 'bg-violet-50 text-violet-700'
  : t === 'fiado' ? 'bg-orange-50 text-orange-700'
  : 'bg-gray-100 text-gray-600'

// ─── Tipos ──────────────────────────────────────────────────────────────────
type Panel = 'fechar' | 'reforco' | 'retirada' | 'saldo' | 'xreport' | null

interface Movimento {
  id: string
  tipo: string
  motivo: string | null
  forma_pagamento: string
  valor: number
  created_at: string
}

interface CaixaAberto {
  id: string
  aberto_em: string
  valor_abertura: number
  status: string
}

interface Historico {
  id: string
  aberto_em: string
  fechado_em: string | null
  valor_abertura: number
  valor_fechamento: number | null
  status: string
}

interface VendaDia {
  id: string
  total: number
  created_at: string
  forma_pagamento?: string
}

interface VendaDetalhe {
  id: string
  numero: number | null
  hora: string
  cliente: string | null
  total: number
  pagamentos: { nome: string; tipo: string; valor: number }[]
}

interface Props {
  lojas: { id: string; nome: string }[]
  lojaAtual: string
  caixaAberto: CaixaAberto | null
  totalVendas: number
  totalCrediario: number
  totalReforcos: number
  totalRetiradas: number
  reforcosDinheiro: number
  retiradasDinheiro: number
  recebidosDinheiro: number
  totalDevolucoes: number
  qtdVendas: number
  movimentos: Movimento[]
  historico: Historico[]
  vendasDia: VendaDia[]
  formas: string[]
  porForma: Record<string, number>
  porTipo: Record<string, number>
  vendasPorTipo: Record<string, VendaConferencia[]>
  vendasDetalhe: VendaDetalhe[]
  erro?: string
  fechado?: boolean
  aberto?: boolean
  zReport?: {
    aberto_em: string
    fechado_em: string
    valor_abertura: number
    obs_fechamento: string | null
    totalVendas: number
    qtdVendas: number
    totalReforcos: number
    totalRetiradas: number
    totalCrediario: number
    porForma: Record<string, number>
    porTipo: Record<string, number>
    movimentos: { tipo: string; motivo: string | null; forma_pagamento: string; valor: number; created_at: string }[]
    valorEsperado: number
    valorContado: number
    operador: string
  } | null
}

// ─── "Em Caixa" — o saldo separado POR TIPO, porque cada um se confere num lugar ──
// Processo da loja (Vitor): dinheiro conta na gaveta · PIX bate nos comprovantes do
// WhatsApp · cartão bate na maquininha (automático) · Crédito Loja é DÍVIDA, não é
// dinheiro em lugar nenhum. Só a linha Dinheiro é o saldo esperado da contagem.
//
// Cada linha ABRE a lista das VENDAS daquela forma. É assim que se confere de verdade:
// a Duda pega comprovante de PIX por comprovante e bate com a venda que o gerou. Lista
// de produto vendido não serve pra isso — o comprovante é da VENDA, não do produto.
function EmCaixaCard({
  abertura,
  porTipo,
  vendasPorTipo,
  reforcosDinheiro,
  retiradasDinheiro,
  recebidosDinheiro,
  saldoGaveta,
  imprimivel = false,
}: {
  abertura: number
  porTipo: Record<string, number>
  vendasPorTipo: Record<string, VendaConferencia[]>
  reforcosDinheiro: number
  retiradasDinheiro: number
  recebidosDinheiro: number
  saldoGaveta: number
  imprimivel?: boolean
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const v = (t: string) => porTipo[t] ?? 0
  const outros = Object.entries(porTipo)
    .filter(([t]) => !['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado'].includes(t))
    .reduce((s, [, x]) => s + x, 0)

  const linhas = [
    { tipo: 'pix', icone: '💠', nome: 'PIX', valor: v('pix'), conferir: 'comprovantes no WhatsApp', cor: 'text-gray-600' },
    { tipo: 'cartao_credito', icone: '💳', nome: 'Cartão de Crédito', valor: v('cartao_credito'), conferir: 'maquininha', cor: 'text-gray-600' },
    { tipo: 'cartao_debito', icone: '💳', nome: 'Cartão de Débito', valor: v('cartao_debito'), conferir: 'maquininha', cor: 'text-gray-600' },
    { tipo: 'outros', icone: '💰', nome: 'Outros', valor: outros, conferir: null, cor: 'text-gray-600' },
    { tipo: 'fiado', icone: '🏷️', nome: 'Crédito Loja (fiado)', valor: v('fiado'), conferir: 'é dívida — não é dinheiro', cor: 'text-orange-700' },
  ].filter((l) => l.valor > 0)

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Dinheiro — a única linha que é gaveta */}
      <Linha
        tipo="dinheiro"
        aberto={aberto}
        setAberto={setAberto}
        vendas={vendasPorTipo['dinheiro'] ?? []}
        imprimivel={imprimivel}
        cabecalho={
          <div className="w-full bg-emerald-50 px-4 py-3 text-left">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-emerald-800">💵 Dinheiro na gaveta</span>
              <span className="text-lg font-extrabold tabular-nums text-emerald-700">{fmt(saldoGaveta)}</span>
            </div>
            <div className="mt-1.5 space-y-0.5 text-xs text-emerald-700/80">
              <div className="flex justify-between"><span>Abertura</span><span className="tabular-nums">{fmt(abertura)}</span></div>
              <div className="flex justify-between">
                <span>+ Vendas em dinheiro {(vendasPorTipo['dinheiro'] ?? []).length > 0 && <b className="ml-1 print:hidden">(ver {(vendasPorTipo['dinheiro'] ?? []).length})</b>}</span>
                <span className="tabular-nums">{fmt(v('dinheiro'))}</span>
              </div>
              {recebidosDinheiro > 0 && <div className="flex justify-between"><span>+ Fiado recebido em dinheiro</span><span className="tabular-nums">{fmt(recebidosDinheiro)}</span></div>}
              {reforcosDinheiro > 0 && <div className="flex justify-between"><span>+ Reforços (dinheiro)</span><span className="tabular-nums">{fmt(reforcosDinheiro)}</span></div>}
              {retiradasDinheiro > 0 && <div className="flex justify-between"><span>− Sangrias (dinheiro)</span><span className="tabular-nums">−{fmt(retiradasDinheiro)}</span></div>}
            </div>
          </div>
        }
      />

      <div className="divide-y divide-gray-50 bg-white">
        {linhas.map((l) => (
          <Linha
            key={l.tipo}
            tipo={l.tipo}
            aberto={aberto}
            setAberto={setAberto}
            vendas={vendasPorTipo[l.tipo] ?? []}
            imprimivel={imprimivel}
            cabecalho={
              <div className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${l.tipo === 'fiado' ? 'bg-orange-50' : ''}`}>
                <span className={l.cor}>
                  {l.icone} {l.nome}
                  {l.conferir && <span className={`ml-2 text-[11px] ${l.tipo === 'fiado' ? 'text-orange-500' : 'text-gray-400'}`}>{l.tipo === 'fiado' ? l.conferir : `conferir: ${l.conferir}`}</span>}
                  {(vendasPorTipo[l.tipo] ?? []).length > 0 && (
                    <span className="ml-2 text-[11px] font-semibold text-blue-600 print:hidden">
                      {aberto === l.tipo ? '▾ ocultar' : `▸ ver ${(vendasPorTipo[l.tipo] ?? []).length} venda${(vendasPorTipo[l.tipo] ?? []).length > 1 ? 's' : ''}`}
                    </span>
                  )}
                </span>
                <span className={`font-semibold tabular-nums ${l.tipo === 'fiado' ? 'text-orange-600' : 'text-gray-800'}`}>{fmt(l.valor)}</span>
              </div>
            }
          />
        ))}
      </div>
    </div>
  )
}

interface VendaConferencia {
  id: string
  numero: number | null
  hora: string
  cliente: string | null
  valorForma: number
  totalVenda: number
  fiado?: boolean   // nao e venda: e fiado recebido (entrou dinheiro sem venda nova)
}

// Uma linha do "Em Caixa" + a lista de vendas que ela abre.
function Linha({
  tipo, aberto, setAberto, vendas, cabecalho, imprimivel,
}: {
  tipo: string
  aberto: string | null
  setAberto: (t: string | null) => void
  vendas: VendaConferencia[]
  cabecalho: React.ReactNode
  imprimivel: boolean
}) {
  const temVendas = vendas.length > 0
  const mostra = imprimivel || aberto === tipo
  const soma = vendas.reduce((s, v) => s + v.valorForma, 0)
  return (
    <div>
      {temVendas ? (
        <button type="button" onClick={() => setAberto(aberto === tipo ? null : tipo)} className="block w-full hover:bg-gray-50/70 transition">
          {cabecalho}
        </button>
      ) : (
        cabecalho
      )}

      {temVendas && mostra && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Vendas desta forma — bata uma a uma
          </p>
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="pb-1 text-left font-semibold">Venda</th>
                <th className="pb-1 text-left font-semibold">Hora</th>
                <th className="pb-1 text-left font-semibold">Cliente</th>
                <th className="pb-1 text-right font-semibold">Nesta forma</th>
                <th className="pb-1 text-right font-semibold">Total da venda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vendas.map((v) => {
                const misto = Math.abs(v.valorForma - v.totalVenda) > 0.005
                return (
                  <tr key={v.id + tipo} className="bg-white">
                    <td className="py-1.5 pr-3 font-mono font-semibold text-gray-700">
                      {v.fiado
                        ? <span className="rounded bg-orange-100 px-1 py-0.5 font-sans text-[10px] font-semibold text-orange-700">fiado</span>
                        : v.numero ? `#${v.numero}` : v.id.slice(-6).toUpperCase()}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-500">{fmtHora(v.hora)}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{v.cliente ?? <span className="text-gray-300">—</span>}</td>
                    <td className="py-1.5 pr-3 text-right font-bold tabular-nums text-gray-900">{fmt(v.valorForma)}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-400">
                      {fmt(v.totalVenda)}
                      {misto && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">misto</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td colSpan={3} className="pt-1.5 text-right font-semibold text-gray-500">Soma</td>
                <td className="pt-1.5 text-right font-extrabold tabular-nums text-gray-900">{fmt(soma)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-[11px] text-gray-400">
            <b>Nesta forma</b> = quanto desta venda entrou por aqui. Venda marcada <b>misto</b> foi paga em mais de uma forma — só este pedaço bate com o comprovante.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── FeedbackMsg ─────────────────────────────────────────────────────────────
function FeedbackMsg({ state }: { state: ActionState }) {
  if (!state) return null
  return (
    <p className={`text-sm font-medium ${state.ok ? 'text-green-600' : 'text-red-600'}`}>
      {state.ok ? '✓' : '✗'} {state.message}
    </p>
  )
}

// ─── Painéis como sub-componentes ────────────────────────────────────────────
// Cada painel monta/desmonta quando o card é aberto/fechado.
// O useActionState fica no sub-componente → state reseta ao reabrir.

// Troco padrão da loja. O campo vinha com 0 e dava pra abrir o dia sem troco sem
// perceber — foi o que aconteceu em 13/07 (dois caixas abertos com R$0).
const TROCO_PADRAO = '200'

function AbrirCaixaPanel({ lojaId }: { lojaId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(abrirCaixa, null)
  const [valor, setValor] = useState(TROCO_PADRAO)
  const zerado = (parseFloat(valor.replace(',', '.')) || 0) === 0

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-800">Abrir Caixa</h3>
      {/* grid + items-start: os campos alinham pelo TOPO. Com flex/items-end, o texto de
          ajuda embaixo de um campo empurrava o outro pra baixo — os inputs saíam
          desencontrados. O botão usa um rótulo invisível como espaçador pra ficar na
          mesma linha dos inputs. */}
      <form
        action={withToken(action)}
        onSubmit={(e) => {
          // abrir sem troco é possível, mas não pode ser por descuido
          if (zerado && !confirm('Abrir o caixa SEM troco na gaveta (R$ 0,00)?\n\nSe você tem troco, informe o valor — senão o fechamento vai acusar sobra.')) {
            e.preventDefault()
          }
        }}
        className="grid items-start gap-4 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input type="hidden" name="loja_id" value={lojaId} />

        <div>
          <label htmlFor="valor_abertura" className="mb-1.5 block text-sm font-medium text-gray-700">
            Troco na Gaveta (R$)
          </label>
          <CampoDinheiro
            id="valor_abertura"
            name="valor_abertura"
            value={Number(valor) || 0}
            onChange={(r) => setValor(String(r))}
            required
            className={zerado ? 'border-amber-300 bg-amber-50/50' : ''}
          />
          <p className="mt-1 text-xs text-gray-400">
            {zerado ? '⚠ Gaveta vazia — confira se não tem troco.' : `Padrão da loja: R$ ${TROCO_PADRAO},00`}
          </p>
        </div>

        <div>
          <label htmlFor="obs_abertura" className="mb-1.5 block text-sm font-medium text-gray-700">
            Observações
          </label>
          <input id="obs_abertura" name="obs_abertura" className="field" placeholder="Ex: quem abriu" />
          <p className="mt-1 text-xs text-gray-400">Opcional.</p>
        </div>

        <div>
          <span aria-hidden className="mb-1.5 block text-sm font-medium invisible">Abrir</span>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-green-600 bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 transition disabled:opacity-50 sm:w-auto"
          >
            {pending && <Spinner />}{pending ? 'Abrindo...' : 'Abrir Caixa'}
          </button>
        </div>
      </form>
      <FeedbackMsg state={state} />
    </div>
  )
}

function FecharCaixaPanel({
  caixaId,
  valorAbertura,
  saldoCaixa,
  porForma,
  porTipo,
  vendasPorTipo,
  reforcosDinheiro,
  retiradasDinheiro,
  recebidosDinheiro,
}: {
  caixaId: string
  valorAbertura: number
  saldoCaixa: number
  porForma: Record<string, number>
  porTipo: Record<string, number>
  vendasPorTipo: Record<string, VendaConferencia[]>
  reforcosDinheiro: number
  retiradasDinheiro: number
  recebidosDinheiro: number
}) {
  const [etapa, setEtapa] = useState<'resumo' | 'cego'>('resumo')
  const [state, action, pending] = useActionState<ActionState, FormData>(fecharCaixa, null)

  const formasEntries = Object.entries(porForma).sort(([, a], [, b]) => b - a)

  // Etapa 1 — resumo do dia (operador vê tudo antes de contar)
  if (etapa === 'resumo') {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fechamento de Caixa</p>
          <p className="text-sm text-gray-500 mt-0.5">Cada forma se confere no seu lugar — a contagem da gaveta é só o dinheiro</p>
        </div>

        <div className="divide-y divide-gray-100">
          <div className="px-6 py-4">
            <EmCaixaCard
              abertura={valorAbertura}
              porTipo={porTipo}
              vendasPorTipo={vendasPorTipo}
              reforcosDinheiro={reforcosDinheiro}
              retiradasDinheiro={retiradasDinheiro}
              recebidosDinheiro={recebidosDinheiro}
              saldoGaveta={saldoCaixa}
            />
          </div>

          {formasEntries.length > 0 && (
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Detalhe por Forma</p>
              <div className="space-y-1.5">
                {formasEntries.map(([forma, valor]) => (
                  <div key={forma} className="flex justify-between text-sm">
                    <span className="text-gray-500">{forma}</span>
                    <span className="font-medium text-green-600">{fmt(valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 flex-1">
            ⚠ Ao prosseguir, você contará o caixa sem ver o saldo esperado.
          </div>
          <button
            onClick={() => setEtapa('cego')}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition shrink-0"
          >
            Contar Caixa →
          </button>
        </div>
      </div>
    )
  }

  // Etapa 2 — fechamento cego (operador NÃO vê o saldo esperado)
  return (
    <div className="rounded-2xl border border-blue-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Contagem de Caixa</p>
        <p className="text-sm text-blue-700 mt-0.5">Conte o dinheiro da gaveta e informe o total abaixo</p>
      </div>

      <form action={withToken(action)} className="px-6 py-5 space-y-4">
        <input type="hidden" name="caixa_id" value={caixaId} />
        <input type="hidden" name="valor_esperado" value={saldoCaixa} />

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            Dinheiro Contado na Gaveta (R$)
          </label>
          <CampoDinheiro name="valor_fechamento" autoFocus required className="text-xl" />
          <p className="text-xs text-gray-400 mt-1">Só cédulas e moedas — PIX, cartão e fiado não entram (conferem no WhatsApp e na maquininha)</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
          <input name="obs_fechamento" className="field" placeholder="Opcional" />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setEtapa('resumo')}
            disabled={pending}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            ← Voltar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
          >
            {pending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Fechando...</span> : 'Confirmar Fechamento'}
          </button>
        </div>
        <FeedbackMsg state={state} />
      </form>
    </div>
  )
}

function ReforcoPanel({
  caixaId,
  formasFisicas,
  movimentos,
}: {
  caixaId: string
  formasFisicas: string[]
  movimentos: Movimento[]
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registrarReforco, null)
  const lista = movimentos.filter((m) => m.tipo === 'reforco')
  return (
    <div className="rounded-2xl border border-green-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-800 text-lg">Reforçar Caixa</h3>
      <p className="text-sm text-gray-500">Entrada de dinheiro no caixa (não é venda).</p>
      <form action={withToken(action)} className="flex flex-wrap gap-4 items-end">
        <input type="hidden" name="caixa_id" value={caixaId} />
        <div className="flex-1 min-w-40">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Forma</label>
          <select name="forma_pagamento" className="field">
            {formasFisicas.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Motivo <span className="text-red-500">*</span></label>
          <input name="motivo" className="field" placeholder="Ex: Troco, reposição..." required />
        </div>
        <div className="w-40">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor (R$)</label>
          <CampoDinheiro name="valor" required />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition disabled:opacity-50"
        >
          {pending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Salvando...</span> : 'Registrar Reforço'}
        </button>
      </form>
      <FeedbackMsg state={state} />
      {lista.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Reforços deste caixa
          </p>
          <div className="space-y-1">
            {lista.map((m) => (
              <div key={m.id} className="flex justify-between text-sm py-1.5 border-b border-gray-50">
                <span className="text-gray-500">
                  {fmtHora(m.created_at)} · {m.forma_pagamento}
                  {m.motivo ? ` — ${m.motivo}` : ''}
                </span>
                <span className="font-semibold text-green-600">{fmt(m.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RetiradaPanel({
  caixaId,
  formasFisicas,
  movimentos,
}: {
  caixaId: string
  formasFisicas: string[]
  movimentos: Movimento[]
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registrarRetirada, null)
  const lista = movimentos.filter((m) => m.tipo === 'retirada')
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-800 text-lg">Retirada (Sangria)</h3>
      <p className="text-sm text-gray-500">Saída de dinheiro do caixa sem ser compra.</p>
      <form action={withToken(action)} className="flex flex-wrap gap-4 items-end">
        <input type="hidden" name="caixa_id" value={caixaId} />
        <div className="flex-1 min-w-40">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Forma</label>
          <select name="forma_pagamento" className="field">
            {formasFisicas.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Motivo <span className="text-red-500">*</span></label>
          <input name="motivo" className="field" placeholder="Ex: pagamento fornecedor..." required />
        </div>
        <div className="w-40">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor (R$)</label>
          <CampoDinheiro name="valor" required />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
        >
          {pending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Salvando...</span> : 'Registrar Retirada'}
        </button>
      </form>
      <FeedbackMsg state={state} />
      {lista.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Retiradas deste caixa
          </p>
          <div className="space-y-1">
            {lista.map((m) => (
              <div key={m.id} className="flex justify-between text-sm py-1.5 border-b border-gray-50">
                <span className="text-gray-500">
                  {fmtHora(m.created_at)} · {m.forma_pagamento}
                  {m.motivo ? ` — ${m.motivo}` : ''}
                </span>
                <span className="font-semibold text-red-600">{fmt(m.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function XReportPanel({
  caixaAberto,
  totalVendas,
  totalCrediario,
  saldoCaixa,
  qtdVendas,
  movimentos,
  porForma,
  porTipo,
  vendasPorTipo,
  reforcosDinheiro,
  retiradasDinheiro,
  recebidosDinheiro,
  vendasDia,
}: {
  caixaAberto: CaixaAberto
  totalVendas: number
  totalCrediario: number
  saldoCaixa: number
  qtdVendas: number
  movimentos: Movimento[]
  porForma: Record<string, number>
  porTipo: Record<string, number>
  vendasPorTipo: Record<string, VendaConferencia[]>
  reforcosDinheiro: number
  retiradasDinheiro: number
  recebidosDinheiro: number
  vendasDia: VendaDia[]
}) {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const reforcos = movimentos.filter((m) => m.tipo === 'reforco')
  const retiradas = movimentos.filter((m) => m.tipo === 'retirada')

  const formasOrdenadas = Object.entries(porForma).sort(([, a], [, b]) => b - a)

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: `@media print { body * { visibility: hidden !important; } #x-report, #x-report * { visibility: visible !important; } #x-report { position: absolute; top: 0; left: 0; width: 100%; } }` }} />
    <div id="x-report" className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Relatório X — Parcial</p>
          <p className="text-sm text-gray-500 mt-0.5">Aberto {fmtDate(caixaAberto.aberto_em)} · Emitido {agora}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-xl border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition print:hidden"
        >
          🖨 Imprimir
        </button>
      </div>

      {/* Resumo top */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-5 py-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Vendas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{qtdVendas}</p>
        </div>
        <div className="px-5 py-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total Vendido</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{fmt(totalVendas)}</p>
        </div>
        <div className="px-5 py-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Dinheiro na Gaveta</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{fmt(saldoCaixa)}</p>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {/* Recebimentos por forma */}
        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Recebimentos por Forma</p>
          {formasOrdenadas.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Nenhuma venda registrada</p>
          ) : (
            <div className="space-y-3">
              {formasOrdenadas.map(([forma, valor]) => {
                const pct = totalVendas > 0 ? (valor / totalVendas) * 100 : 0
                const icon = forma === 'PIX' ? '💠' : forma === 'Dinheiro' ? '💵' : forma === 'Cartão' ? '💳' : forma === 'Crediário' ? '📋' : '💰'
                return (
                  <div key={forma} className="flex items-center gap-3">
                    <span className="text-base w-6 text-center shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{forma}</span>
                        <span className="font-bold text-gray-900">{fmt(valor)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right shrink-0">{pct.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Crediário destacado */}
        {totalCrediario > 0 && (
          <div className="px-6 py-4 bg-orange-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <div>
                  <p className="text-sm font-semibold text-orange-800">Crediário (a receber)</p>
                  <p className="text-xs text-orange-500">Não entra no saldo físico</p>
                </div>
              </div>
              <p className="text-lg font-bold text-orange-600">{fmt(totalCrediario)}</p>
            </div>
          </div>
        )}

        {/* Composição do saldo — separado por onde cada tipo se confere */}
        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Em Caixa (por tipo)</p>
          <EmCaixaCard
            abertura={caixaAberto.valor_abertura}
            porTipo={porTipo}
            vendasPorTipo={vendasPorTipo}
            reforcosDinheiro={reforcosDinheiro}
            retiradasDinheiro={retiradasDinheiro}
            recebidosDinheiro={recebidosDinheiro}
            saldoGaveta={saldoCaixa}
            imprimivel
          />
        </div>

        {/* Vendas do Dia */}
        {vendasDia.length > 0 && (
          <div className="px-6 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Vendas do Dia ({vendasDia.length})
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-2 text-left text-xs font-semibold text-gray-400 uppercase">Código</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-400 uppercase">Hora</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-400 uppercase">Forma</th>
                    <th className="pb-2 text-right text-xs font-semibold text-gray-400 uppercase">Valor</th>
                    <th className="pb-2 text-right text-xs font-semibold text-gray-400 uppercase">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(() => {
                    let saldo = caixaAberto.valor_abertura
                    return [...vendasDia].reverse().map((v) => {
                      const ehCrediario = (v.forma_pagamento ?? '').toLowerCase().includes('credi') || (v.forma_pagamento ?? '').toLowerCase().includes('fiado')
                      if (!ehCrediario) saldo += v.total
                      return (
                        <tr key={v.id} className="hover:bg-blue-50/60">
                          <td className="py-1.5 pr-3 font-mono text-gray-500 text-xs">{v.id.slice(-6).toUpperCase()}</td>
                          <td className="py-1.5 pr-3 text-gray-500">{fmtHora(v.created_at)}</td>
                          <td className="py-1.5 pr-3 text-gray-700">{v.forma_pagamento ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-right font-semibold text-gray-900">{fmt(v.total)}</td>
                          <td className={`py-1.5 text-right font-semibold ${ehCrediario ? 'text-orange-500' : 'text-green-600'}`}>{fmt(saldo)}</td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Movimentos — quebra de página na impressão */}
        {(reforcos.length > 0 || retiradas.length > 0) && (
          <div className="px-6 py-4" style={{ breakBefore: 'page', pageBreakBefore: 'always' }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Movimentos do Caixa</p>
            <div className="space-y-1">
              {[...reforcos.map(m => ({ ...m, _r: 'reforco' as const })), ...retiradas.map(m => ({ ...m, _r: 'retirada' as const }))]
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .map((m) => (
                  <div key={m.id} className="flex justify-between items-baseline text-sm py-1">
                    <span className="text-gray-500">
                      {m._r === 'reforco' ? '↑' : '↓'} {fmtHora(m.created_at)}
                      {m.motivo ? ` · ${m.motivo}` : ''}
                      <span className="text-gray-400 text-xs ml-1">({m.forma_pagamento})</span>
                    </span>
                    <span className={`font-semibold ml-4 ${m._r === 'reforco' ? 'text-green-600' : 'text-red-500'}`}>
                      {m._r === 'reforco' ? '+' : '−'}{fmt(m.valor)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">Este relatório não encerra o caixa · {agora}</p>
      </div>
    </div>
    </>
  )
}

function SaldoPanel({
  caixaAberto,
  saldoCaixa,
  saldoTotal,
  vendasDia,
  qtdVendas,
  porForma,
  porTipo,
  vendasPorTipo,
  reforcosDinheiro,
  retiradasDinheiro,
  recebidosDinheiro,
}: {
  caixaAberto: CaixaAberto
  saldoCaixa: number
  saldoTotal: number
  vendasDia: VendaDia[]
  qtdVendas: number
  porForma: Record<string, number>
  porTipo: Record<string, number>
  vendasPorTipo: Record<string, VendaConferencia[]>
  reforcosDinheiro: number
  retiradasDinheiro: number
  recebidosDinheiro: number
}) {
  return (
    <div className="rounded-2xl border border-cyan-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-800 text-lg">Saldo do Caixa</h3>
      <EmCaixaCard
        abertura={caixaAberto.valor_abertura}
        porTipo={porTipo}
        vendasPorTipo={vendasPorTipo}
        reforcosDinheiro={reforcosDinheiro}
        retiradasDinheiro={retiradasDinheiro}
        recebidosDinheiro={recebidosDinheiro}
        saldoGaveta={saldoCaixa}
      />
      <div className="flex justify-between rounded-xl bg-cyan-50 px-4 py-3 font-bold text-sm">
        <span className="text-cyan-900">Total do turno (todas as formas, incl. fiado)</span>
        <span className="text-cyan-700 tabular-nums">{fmt(saldoTotal)}</span>
      </div>
      {Object.keys(porForma).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Por Forma de Pagamento</p>
          <div className="space-y-1">
            {Object.entries(porForma).sort(([,a],[,b]) => b-a).map(([forma, valor]) => (
              <div key={forma} className="flex justify-between text-sm py-1.5 border-b border-gray-50">
                <span className="text-gray-600">{forma}</span>
                <span className="font-semibold text-green-600">{fmt(valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {vendasDia.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Vendas ({qtdVendas})
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {vendasDia.map((v) => (
              <div key={v.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                <span className="text-gray-400 font-mono">{fmtHora(v.created_at)}</span>
                <span className="font-semibold text-gray-700">{fmt(v.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Z Report (relatório formal de fechamento) ───────────────────────────────
function ZReportPanel({ z }: {
  z: {
    aberto_em: string
    fechado_em: string
    valor_abertura: number
    obs_fechamento: string | null
    totalVendas: number
    qtdVendas: number
    totalReforcos: number
    totalRetiradas: number
    totalCrediario: number
    porForma: Record<string, number>
    porTipo: Record<string, number>
    movimentos: { tipo: string; motivo: string | null; forma_pagamento: string; valor: number; created_at: string }[]
    valorEsperado: number
    valorContado: number
    operador: string
  }
}) {
  const divergencia = z.valorContado - z.valorEsperado
  const divergenciaGrave = divergencia < -50 || (z.valorEsperado > 0 && Math.abs(divergencia) / z.valorEsperado > 0.05)
  const divergenciaPositiva = divergencia > 0.01
  const zerado = Math.abs(divergencia) <= 0.01

  const fmtDt = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

  const formasEntries = Object.entries(z.porForma).sort(([, a], [, b]) => b - a)
  const reforcos = z.movimentos.filter((m) => m.tipo === 'reforco')
  const retiradas = z.movimentos.filter((m) => m.tipo === 'retirada')

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@media print { body * { visibility: hidden !important; } #z-report, #z-report * { visibility: visible !important; } #z-report { position: absolute; top: 0; left: 0; width: 100%; } }` }} />

      <div id="z-report" className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-6 py-5 bg-gray-900 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Relatório Z — Fechamento de Caixa</p>
              <p className="text-lg font-bold mt-1">TecnoCell</p>
              <p className="text-xs text-gray-400 mt-0.5">CNPJ 39.682.023/0001-69</p>
            </div>
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2 text-sm font-medium text-white transition print:hidden"
            >
              🖨️ Imprimir
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400 text-xs">Abertura</p>
              <p className="font-medium">{fmtDt(z.aberto_em)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Fechamento</p>
              <p className="font-medium">{fmtDt(z.fechado_em)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-400 text-xs">Operador</p>
              <p className="font-medium">{z.operador}</p>
            </div>
          </div>
        </div>

        {/* Resumo financeiro */}
        <div className="divide-y divide-gray-100">
          <div className="px-6 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Movimento do Dia</p>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Abertura do Caixa', valor: z.valor_abertura, color: 'text-gray-700' },
                { label: `Vendas (${z.qtdVendas} transações)`, valor: z.totalVendas, color: 'text-green-700' },
                { label: 'Reforços recebidos', valor: z.totalReforcos, color: 'text-green-700' },
                { label: 'Sangrias realizadas', valor: -z.totalRetiradas, color: 'text-red-600' },
              ].map(({ label, valor, color }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className={`font-semibold ${color}`}>{valor < 0 ? `−${fmt(Math.abs(valor))}` : fmt(valor)}</span>
                </div>
              ))}
              {z.totalCrediario > 0 && (
                <div className="flex justify-between text-gray-400">
                  <span>Crediário (não entra no caixa)</span>
                  <span>{fmt(z.totalCrediario)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Breakdown por forma — onde conferir cada uma */}
          {formasEntries.length > 0 && (
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Vendas por Forma de Pagamento</p>
              <div className="space-y-2">
                {formasEntries.map(([forma, valor]) => (
                  <div key={forma} className="flex justify-between text-sm">
                    <span className="text-gray-500">{forma}</span>
                    <span className="font-semibold text-green-700">{fmt(valor)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-gray-400">
                Conferência: dinheiro na gaveta · PIX nos comprovantes do WhatsApp · cartão na maquininha · Crédito Loja é dívida (não é dinheiro).
              </p>
            </div>
          )}

          {/* Movimentos (reforços e retiradas) */}
          {(reforcos.length > 0 || retiradas.length > 0) && (
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Movimentos de Caixa</p>
              <div className="space-y-1.5 text-sm">
                {[...reforcos, ...retiradas]
                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map((m, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <div>
                        <span className={`text-xs font-semibold uppercase ${m.tipo === 'reforco' ? 'text-green-600' : 'text-red-500'}`}>
                          {m.tipo === 'reforco' ? '↑ Reforço' : '↓ Sangria'}
                        </span>
                        {m.motivo && <span className="text-gray-400 ml-2 text-xs">— {m.motivo}</span>}
                      </div>
                      <span className={`font-semibold ${m.tipo === 'reforco' ? 'text-green-700' : 'text-red-600'}`}>
                        {m.tipo === 'retirada' ? '−' : '+'}{fmt(m.valor)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Conferência */}
          <div className={`px-6 py-4 ${divergenciaGrave ? 'bg-red-50' : divergenciaPositiva ? 'bg-blue-50' : 'bg-green-50'}`}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Conferência da Gaveta (só dinheiro)</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Dinheiro esperado na gaveta</span>
                <span className="font-semibold text-gray-700">{fmt(z.valorEsperado)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Dinheiro contado pelo operador</span>
                <span className="font-semibold text-gray-700">{fmt(z.valorContado)}</span>
              </div>
              <div className={`flex justify-between pt-2 border-t font-bold text-base ${divergenciaGrave ? 'border-red-200 text-red-700' : divergenciaPositiva ? 'border-blue-200 text-blue-700' : 'border-green-200 text-green-700'}`}>
                <span>Divergência</span>
                <span>{divergencia > 0 ? '+' : ''}{fmt(divergencia)}</span>
              </div>
            </div>
            <p className={`text-xs mt-3 font-medium ${divergenciaGrave ? 'text-red-600' : divergenciaPositiva ? 'text-blue-600' : 'text-green-600'}`}>
              {divergenciaGrave ? '⚠ Divergência significativa — registre com o supervisor.' : divergenciaPositiva ? 'Sobra de caixa. Verifique se há troco pendente.' : zerado ? '✓ Caixa conferido sem divergências.' : ''}
            </p>
          </div>

          {/* Observações */}
          {z.obs_fechamento && (
            <div className="px-6 py-3 bg-gray-50">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Observações</p>
              <p className="text-sm text-gray-600">{z.obs_fechamento}</p>
            </div>
          )}

          {/* Assinatura */}
          <div className="px-6 py-6 grid grid-cols-2 gap-8 print:block">
            <div className="text-center">
              <div className="border-t border-gray-400 pt-2 mt-8">
                <p className="text-xs text-gray-400">Operador / Assinatura</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-400 pt-2 mt-8">
                <p className="text-xs text-gray-400">Supervisor / Visto</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
export function OperacaoClient({
  lojas,
  lojaAtual,
  caixaAberto,
  totalVendas,
  totalCrediario,
  totalReforcos,
  totalRetiradas,
  reforcosDinheiro,
  retiradasDinheiro,
  recebidosDinheiro,
  totalDevolucoes,
  qtdVendas,
  movimentos,
  historico,
  vendasDia,
  formas,
  porForma,
  porTipo,
  vendasPorTipo,
  vendasDetalhe,
  erro,
  fechado,
  aberto,
  zReport,
}: Props) {
  const [panel, setPanel] = useState<Panel>(null)
  const toggle = (p: Panel) => setPanel((prev) => (prev === p ? null : p))
  // carrega o token do navegador 1x → o withToken usa ele síncrono no submit
  useEffect(() => { authToken().then((t) => { tokenCache = t }) }, [])

  const formasFisicas = formas.filter((f) => !FORMAS_INVALIDAS.some((inv) => f.includes(inv)))
  // Saldo da GAVETA = só dinheiro físico. PIX está no banco, cartão está na
  // maquininha, fiado é dívida — contar isso como cédula gerava divergência
  // falsa em cima de quem fecha o caixa (aconteceu: caixa 09→13/07, R$30 de
  // PIX cobrado como se faltasse na gaveta).
  const saldoCaixa =
    (caixaAberto?.valor_abertura ?? 0) +
    (porTipo['dinheiro'] ?? 0) +
    recebidosDinheiro +          // fiado cobrado em especie: a cedula ESTA na gaveta
    reforcosDinheiro -
    retiradasDinheiro -
    totalDevolucoes
  // Tudo que o turno produziu, em qualquer forma (incl. fiado) — visão gerencial
  const saldoTotal =
    (caixaAberto?.valor_abertura ?? 0) + totalVendas + totalReforcos - totalRetiradas - totalDevolucoes

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/painel/pdv" className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar ao PDV
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Operação do PDV</h2>
        {lojas.length > 1 && (
          <select
            value={lojaAtual}
            onChange={(e) => { window.location.href = `/painel/pdv/operacao?loja=${e.target.value}` }}
            className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Caixa é por loja"
          >
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        )}
      </div>

      {fechado && !caixaAberto && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-green-200 bg-green-50 px-6 py-5 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100 text-2xl">🔒</div>
            <div>
              <p className="font-bold text-green-800 text-lg">Caixa fechado com sucesso!</p>
              <p className="text-sm text-green-600 mt-0.5">O caixa do dia foi encerrado. Abra um novo caixa quando retomar as vendas.</p>
            </div>
          </div>
          {zReport && <ZReportPanel z={zReport} />}
        </div>
      )}

      {aberto && caixaAberto && (
        <div className="rounded-2xl border border-green-300 bg-green-600 px-6 py-5 flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-500 text-2xl">✓</div>
          <div>
            <p className="font-bold text-white text-lg">Caixa aberto com sucesso!</p>
            <p className="text-sm text-green-100 mt-0.5">
              Saldo inicial: {fmt(caixaAberto.valor_abertura)} · Aberto às {fmtHora(caixaAberto.aberto_em)}
            </p>
          </div>
        </div>
      )}

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      {/* Status */}
      <div className={`rounded-2xl border p-5 ${caixaAberto ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Status do Caixa</p>
            <p className={`text-xl font-bold mt-0.5 ${caixaAberto ? 'text-green-700' : 'text-gray-500'}`}>
              {caixaAberto ? 'Aberto' : 'Fechado'}
            </p>
            {caixaAberto && (
              <p className="text-xs text-gray-500 mt-1">
                Aberto em {fmtDate(caixaAberto.aberto_em)} · Saldo inicial:{' '}
                {fmt(caixaAberto.valor_abertura ?? 0)}
              </p>
            )}
          </div>
          <div className={`h-3 w-3 rounded-full ${caixaAberto ? 'bg-green-500' : 'bg-gray-300'}`} />
        </div>
      </div>

      {caixaAberto ? (
        <>
          {/* Resumo rápido */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total em Vendas</p>
              <p className="mt-1 text-xl font-bold text-green-600">{fmt(totalVendas)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nº de Vendas</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{qtdVendas}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ticket Médio</p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {qtdVendas > 0 ? fmt(totalVendas / qtdVendas) : '—'}
              </p>
            </div>
          </div>

          {/* 6 cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <button
              onClick={() => toggle('fechar')}
              className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                panel === 'fechar' ? 'border-blue-400 bg-blue-50' : 'border-blue-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className="mb-2 text-2xl">🔒</div>
              <p className="text-sm font-semibold text-blue-800">Fechar Caixa</p>
            </button>
            <button
              onClick={() => toggle('reforco')}
              className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                panel === 'reforco' ? 'border-green-400 bg-green-50' : 'border-green-200 bg-white hover:border-green-300'
              }`}
            >
              <div className="mb-2 text-2xl">💰</div>
              <p className="text-sm font-semibold text-green-800">Reforçar Caixa</p>
            </button>
            <button
              onClick={() => toggle('retirada')}
              className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                panel === 'retirada' ? 'border-red-400 bg-red-50' : 'border-red-200 bg-white hover:border-red-300'
              }`}
            >
              <div className="mb-2 text-2xl">💸</div>
              <p className="text-sm font-semibold text-red-800">Retirada</p>
            </button>

            <a href="/painel/devolucoes"
              className="rounded-2xl border border-orange-200 bg-white p-4 text-left transition hover:border-orange-400 hover:shadow-md block">
              <div className="mb-2 text-2xl">↩️</div>
              <p className="text-sm font-semibold text-orange-800">Devolução</p>
            </a>

            <button
              onClick={() => toggle('saldo')}
              className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                panel === 'saldo'
                  ? 'border-cyan-400 bg-cyan-50'
                  : 'border-cyan-200 bg-white hover:border-cyan-300'
              }`}
            >
              <div className="mb-2 text-2xl">📊</div>
              <p className="text-sm font-semibold text-cyan-800">Saldo em Caixa</p>
              <p className="text-xs font-bold text-cyan-600 mt-1">{fmt(saldoCaixa)}</p>
            </button>

            <button
              onClick={() => toggle('xreport')}
              className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                panel === 'xreport'
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-indigo-200 bg-white hover:border-indigo-300'
              }`}
            >
              <div className="mb-2 text-2xl">📋</div>
              <p className="text-sm font-semibold text-indigo-800">Relatório X</p>
              <p className="text-xs text-indigo-500 mt-0.5">Parcial</p>
            </button>
          </div>

          {/* Painéis — montam/desmontam para resetar useActionState */}
          {panel === 'fechar' && (
            <FecharCaixaPanel
              caixaId={caixaAberto.id}
              valorAbertura={caixaAberto.valor_abertura}
              saldoCaixa={saldoCaixa}
              porForma={porForma}
              porTipo={porTipo}
              vendasPorTipo={vendasPorTipo}
              reforcosDinheiro={reforcosDinheiro}
              retiradasDinheiro={retiradasDinheiro}
              recebidosDinheiro={recebidosDinheiro}
            />
          )}
          {panel === 'reforco' && (
            <ReforcoPanel
              caixaId={caixaAberto.id}
              formasFisicas={formasFisicas}
              movimentos={movimentos}
            />
          )}
          {panel === 'retirada' && (
            <RetiradaPanel
              caixaId={caixaAberto.id}
              formasFisicas={formasFisicas}
              movimentos={movimentos}
            />
          )}
          {panel === 'xreport' && (
            <XReportPanel
              caixaAberto={caixaAberto}
              totalVendas={totalVendas}
              totalCrediario={totalCrediario}
              saldoCaixa={saldoCaixa}
              qtdVendas={qtdVendas}
              movimentos={movimentos}
              porForma={porForma}
              porTipo={porTipo}
              vendasPorTipo={vendasPorTipo}
              reforcosDinheiro={reforcosDinheiro}
              retiradasDinheiro={retiradasDinheiro}
              recebidosDinheiro={recebidosDinheiro}
              vendasDia={vendasDia}
            />
          )}
          {panel === 'saldo' && (
            <SaldoPanel
              caixaAberto={caixaAberto}
              saldoCaixa={saldoCaixa}
              saldoTotal={saldoTotal}
              vendasDia={vendasDia}
              qtdVendas={qtdVendas}
              porForma={porForma}
              porTipo={porTipo}
              vendasPorTipo={vendasPorTipo}
              reforcosDinheiro={reforcosDinheiro}
              retiradasDinheiro={retiradasDinheiro}
              recebidosDinheiro={recebidosDinheiro}
            />
          )}

          {/* Vendas do caixa — o que se confere. (Era "Itens Vendidos": produto × qtd
              não bate com nada, porque o comprovante e a maquininha falam de VENDA.) */}
          {vendasDetalhe.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">Vendas deste caixa</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Cada venda com as formas que a pagaram</p>
                </div>
                <span className="text-xs text-gray-400">
                  {qtdVendas} venda{qtdVendas !== 1 ? 's' : ''} · {fmt(totalVendas)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-2.5 text-left text-xs font-semibold uppercase text-gray-400">Venda</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-400">Hora</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-400">Cliente</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-400">Pagamento</th>
                      <th className="px-6 py-2.5 text-right text-xs font-semibold uppercase text-gray-400">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {vendasDetalhe.map((v) => (
                      <tr key={v.id} className="hover:bg-blue-50/50 transition">
                        <td className="px-6 py-2.5 font-mono font-semibold text-gray-700">
                          {v.numero ? `#${v.numero}` : v.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{fmtHora(v.hora)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{v.cliente ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {v.pagamentos.length === 0 && <span className="text-gray-300">—</span>}
                            {v.pagamentos.map((pg, i) => (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${corDoTipo(pg.tipo)}`}
                              >
                                {iconeDoTipo(pg.tipo)} {pg.nome}
                                {v.pagamentos.length > 1 && <b className="tabular-nums">{fmt(pg.valor)}</b>}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-2.5 text-right font-bold tabular-nums text-gray-900">{fmt(v.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-gray-100 px-6 py-2.5 text-[11px] text-gray-400">
                Venda com mais de uma etiqueta foi paga em formas diferentes — o valor de cada uma aparece na etiqueta.
              </p>
            </div>
          )}
        </>
      ) : (
        <AbrirCaixaPanel lojaId={lojaAtual} />
      )}

      {/* Histórico */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Histórico de Caixas</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Abertura</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fechamento</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Inicial</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Final</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {historico.map((c) => (
              <tr key={c.id} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(c.aberto_em)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {c.fechado_em ? fmtDate(c.fechado_em) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  {fmt(c.valor_abertura ?? 0)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  {c.valor_fechamento != null ? fmt(c.valor_fechamento) : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === 'aberto' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
