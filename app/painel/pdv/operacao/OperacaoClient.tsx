'use client'

import { Spinner } from '@/components/Spinner'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { useActionState, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { labelTipoPagamento } from '@/lib/formas-pagamento'
import {
  abrirCaixa,
  baixarPixDoFornecedor,
  fecharCaixa,
  registrarReforco,
  registrarRetirada,
  type ActionState,
} from './actions'
import type { DestinoNaTela, PixAvisos } from '@/lib/pix-destinos'
import { avisosDeFechamento, precisaCiencia, type AvisoCaixa } from '@/lib/avisos-caixa'

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

// Mercado Livre entra aqui pelo mesmo motivo do fiado: reforço/retirada é
// movimento manual da gaveta física, e essa forma só existe pro webhook usar.
const FORMAS_INVALIDAS = ['Crédito Loja (Fiado)', 'Crediário', 'Crédito Loja', 'Mercado Livre']

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
  /** quanto essa venda trouxe de dinheiro até agora: o que foi pago na hora +
      o fiado dela que já foi abatido depois. 0 = ainda é só dívida. */
  recebido?: number
  /** formas que realmente pagaram a venda — venda mista tem mais de uma */
  formas?: string[]
}

interface VendaDetalhe {
  id: string
  numero: number | null
  hora: string
  cliente: string | null
  total: number
  /** fiado cancelado por devolução — não é dinheiro e já saiu do total do turno */
  devolvida: boolean
  /** quanto do fiado já foi pago depois da venda (F9/Fiados). 0 = ainda em aberto */
  fiadoAbatido: number
  /** fatia da venda que foi fiado (venda mista pode ter só parte no fiado) */
  fiadoValor: number
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
  totalTaxaCartao: number
  vendasPorTipo: Record<string, VendaConferencia[]>
  vendasDetalhe: VendaDetalhe[]
  estornosPix?: number
  estornosSemSplit?: number
  pixPendentes: { id: string; cliente: string | null; valor: number; hora: string }[]
  pixDestinos?: DestinoNaTela[]
  pixAvisos?: PixAvisos
  pixFornecedorSemBaixa?: { total: number; comprovantes: number }
  trocoPadrao?: number
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
    totalTaxaCartao: number
    estornosPix?: number
    movimentos: { tipo: string; motivo: string | null; forma_pagamento: string; valor: number; created_at: string }[]
    valorEsperado: number
    valorContado: number
    operador: string
  } | null
}

// Lista "por forma" da CONFERÊNCIA: o que deve estar em cada lugar agora.
// A linha do Dinheiro soma a ABERTURA (o troco já estava na gaveta antes de
// vender); as outras não têm abertura — cartão e PIX não começam o dia com
// saldo. Usada nos 4 lugares (fechar, saldo, Relatório X e Z) pra todos
// mostrarem o MESMO número: antes o X dizia Dinheiro 556 e o Fechar Caixa
// dizia 356, e ninguém sabia qual era o certo.
function listaPorForma(porForma: Record<string, number>, abertura: number): [string, number][] {
  return (Object.entries(porForma) as [string, number][])
    .map(([nome, v]) => [nome, /dinheiro/i.test(nome) ? v + abertura : v] as [string, number])
    .sort((a, b) => b[1] - a[1])
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
    .filter(([t]) => !['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado', 'vale_credito'].includes(t))
    .reduce((s, [, x]) => s + x, 0)

  // Uma cor por LUGAR de conferência, não por forma: quem fecha o caixa
  // aprende de relance onde bater cada uma. Antes PIX, os dois cartões e
  // "Outros" eram todos cinza — só fiado e vale tinham cor, e a lista virava
  // um bloco só ("muito desorganizado", dono 27/08).
  //   verde  = gaveta (conta na mão)   · azul  = banco (extrato/WhatsApp)
  //   roxo   = maquininha              · rosa  = saldo do cliente
  //   âmbar  = dívida (não é dinheiro) · cinza = resto
  const linhas = [
    { tipo: 'pix', icone: '💠', nome: 'PIX', valor: v('pix'), conferir: 'comprovantes no WhatsApp',
      bg: 'bg-sky-50/70', cor: 'text-sky-800', valorCor: 'text-sky-700', nota: 'text-sky-600/70', barra: 'border-sky-400' },
    { tipo: 'cartao_credito', icone: '💳', nome: 'Cartão de Crédito', valor: v('cartao_credito'), conferir: 'maquininha',
      bg: 'bg-violet-50/70', cor: 'text-violet-800', valorCor: 'text-violet-700', nota: 'text-violet-600/70', barra: 'border-violet-400' },
    { tipo: 'cartao_debito', icone: '💳', nome: 'Cartão de Débito', valor: v('cartao_debito'), conferir: 'maquininha',
      bg: 'bg-violet-50/70', cor: 'text-violet-800', valorCor: 'text-violet-700', nota: 'text-violet-600/70', barra: 'border-violet-400' },
    { tipo: 'vale_credito', icone: '🎟️', nome: 'Vale Crédito', valor: v('vale_credito'), conferir: 'saiu do saldo do cliente — não é dinheiro',
      bg: 'bg-pink-50/70', cor: 'text-pink-800', valorCor: 'text-pink-700', nota: 'text-pink-600/70', barra: 'border-pink-400' },
    { tipo: 'fiado', icone: '🏷️', nome: labelTipoPagamento('fiado'), valor: v('fiado'), conferir: 'é dívida — não é dinheiro',
      bg: 'bg-orange-50', cor: 'text-orange-800', valorCor: 'text-orange-600', nota: 'text-orange-500', barra: 'border-orange-400' },
    { tipo: 'outros', icone: '💰', nome: 'Outros', valor: outros, conferir: null,
      bg: 'bg-slate-50/70', cor: 'text-slate-700', valorCor: 'text-slate-700', nota: 'text-slate-500', barra: 'border-slate-300' },
  ].filter((l) => Math.abs(l.valor) > 0.005)

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
          <div className="w-full bg-emerald-50 px-4 py-3 text-left border-l-4 border-emerald-500">
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
            // faixa colorida na esquerda (mesma espessura do card do Dinheiro):
            // agrupa os dois cartões e separa gaveta / banco / maquininha / dívida de relance
            cabecalho={
              <div className={`flex w-full items-center justify-between gap-3 border-l-4 px-4 py-2.5 text-left text-sm ${l.bg} ${l.barra}`}>
                <span className={`flex-1 min-w-0 font-medium ${l.cor}`}>
                  {l.icone} {l.nome}
                  {l.conferir && <span className={`ml-2 text-[11px] font-normal ${l.nota}`}>{l.tipo === 'fiado' || l.tipo === 'vale_credito' ? l.conferir : `conferir: ${l.conferir}`}</span>}
                  {(vendasPorTipo[l.tipo] ?? []).length > 0 && (
                    <span className="ml-2 text-[11px] font-semibold text-blue-600 print:hidden">
                      {aberto === l.tipo ? '▾ ocultar' : `▸ ver ${(vendasPorTipo[l.tipo] ?? []).length} venda${(vendasPorTipo[l.tipo] ?? []).length > 1 ? 's' : ''}`}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 font-bold tabular-nums ${l.valorCor}`}>{fmt(l.valor)}</span>
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
  /** taxa da maquininha embutida no total da venda — cartão vem líquido em
      valorForma, então some com ela pra comparar com o total (senão parece
      "misto" uma venda paga numa forma só). */
  taxa?: number
  fiado?: boolean   // nao e venda: e fiado recebido (entrou dinheiro sem venda nova)
  /** quanto desse fiado ja foi pago depois (F9/Fiados). so faz sentido no tipo 'fiado' */
  fiadoAbatido?: number
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
  // A linha por venda mostra o valor CHEIO do fiado (é o valor real daquela
  // dívida, subtrair quebraria o selo "misto"). A soma do rodapé, sim, tira o
  // já abatido — pra bater com o total do cabeçalho, que já foi corrigido.
  const soma = vendas.reduce((s, v) => s + v.valorForma - (v.fiadoAbatido ?? 0), 0)
  // Recebimento de fiado (cliente pagando dívida antiga) NÃO é venda — não tem
  // número, fica só com uma etiqueta genérica no lugar. Misturado com vendas
  // de verdade na mesma tabela "Venda" ficava esquisito (achado pelo dono
  // 27/08: "pq ta escrito fiado aqui"). Separa em dois blocos.
  const vendasReais = vendas.filter((v) => !v.fiado)
  const recebimentos = vendas.filter((v) => v.fiado)
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
        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3 space-y-4">
          {vendasReais.length > 0 && (
            <div>
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
                  {vendasReais.map((v) => {
                    // misto compara o valor CHEIO do fiado com o total da venda — nunca
                    // o restante, senão fiado parcialmente pago vira "misto" por engano.
                    // Some a taxa de volta: cartão vem líquido em valorForma, mas o total
                    // da venda inclui a taxa repassada — sem isso, QUALQUER venda de
                    // cartão com taxa virava "misto" mesmo sendo uma forma só (achado
                    // pelo dono 27/08, venda #666: R$99 líquido + R$2,97 taxa = R$101,97).
                    const misto = Math.abs(v.valorForma + (v.taxa ?? 0) - v.totalVenda) > 0.005
                    // "Nesta forma" mostra o que AINDA falta, não o valor original —
                    // já quitado nem chega aqui (filtrado em page.tsx); parcial mostra
                    // só o restante, o "abatido" ao lado conta o que já foi pago.
                    const restante = (v.fiadoAbatido ?? 0) > 0 ? Math.max(0, v.valorForma - (v.fiadoAbatido ?? 0)) : v.valorForma
                    return (
                      <tr key={v.id + tipo} className="bg-white">
                        <td className="py-1.5 pr-3 font-mono font-semibold text-gray-700">
                          {v.numero ? `#${v.numero}` : v.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-500">{fmtHora(v.hora)}</td>
                        <td className="py-1.5 pr-3 text-gray-600">{v.cliente ?? <span className="text-gray-300">—</span>}</td>
                        <td className="py-1.5 pr-3 text-right font-bold tabular-nums text-gray-900">{fmt(restante)}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-400">
                          {fmt(v.totalVenda)}
                          {misto && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">misto</span>}
                          {/* So chega aqui fiado PARCIALMENTE pago (o quitado nem entra na
                              lista — page.tsx ja filtra). "Nesta forma" mostra o restante;
                              esta tag mostra quanto ja foi abatido, pra explicar por que o
                              restante e menor que o total da venda. */}
                          {(v.fiadoAbatido ?? 0) > 0.005 && (
                            <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700">
                              abatido {fmt(v.fiadoAbatido!)}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-gray-400">
                <b>Nesta forma</b> = quanto desta venda entrou por aqui. Venda marcada <b>misto</b> foi paga em mais de uma forma — só este pedaço bate com o comprovante.
              </p>
            </div>
          )}

          {/* Recebimento de dívida antiga não é venda — não tem número. Antes vinha
              disfarçado na mesma tabela, com "fiado" no lugar do #número (achado
              pelo dono 27/08). Agora fica no seu próprio bloco. */}
          {recebimentos.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Recebimento de fiado — dívida antiga paga agora
              </p>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="pb-1 text-left font-semibold">Hora</th>
                    <th className="pb-1 text-left font-semibold">Cliente</th>
                    <th className="pb-1 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recebimentos.map((v) => (
                    <tr key={v.id + tipo} className="bg-white">
                      <td className="py-1.5 pr-3 text-gray-500">{fmtHora(v.hora)}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{v.cliente ?? <span className="text-gray-300">—</span>}</td>
                      <td className="py-1.5 text-right font-bold tabular-nums text-gray-900">{fmt(v.valorForma)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-between border-t-2 border-gray-200 pt-1.5 text-xs">
            <span className="font-semibold text-gray-500">{tipo === 'pix' ? 'Entradas Pix antes de devoluções' : 'Soma'}</span>
            <span className="font-extrabold tabular-nums text-gray-900">{fmt(soma)}</span>
          </div>
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

// ─── PIX do dia: quem recebeu e quanto ainda se deve ─────────────────────────
// É a conferência que o dono faz no Telegram, já somada e ligada ao cadastro.
// Cada linha é um recebedor dos comprovantes do dia:
//   · fornecedor       → o cliente pagou a dívida da compra; NÃO entrou dinheiro
//   · nossa conta      → o dinheiro está no banco e paga folha/custo
//   · não identificado → o dono aponta uma vez qual fornecedor é
// A baixa não tira nada de gaveta nem de conta: só diminui a dívida.
export function PixDoDiaCard({
  destinos,
  pixDoCaixa,
  avisos,
}: {
  destinos: DestinoNaTela[]
  pixDoCaixa?: number
  avisos?: PixAvisos
}) {
  const totalGeral = destinos.reduce((s, d) => s + d.total, 0)
  const paraFornecedor = destinos.filter((d) => !d.propria)
  const naConta = destinos.filter((d) => d.propria).reduce((s, d) => s + d.total, 0)
  const semLer = destinos.reduce((s, d) => s + d.semValor, 0)

  return (
    <div className="px-6 py-4 border-t border-blue-100 bg-blue-50/50">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-xs font-semibold text-blue-900/70 uppercase tracking-wider">PIX do dia — quem recebeu</p>
        <p className="text-[11px] text-blue-900/50">lido dos comprovantes do Telegram</p>
      </div>

      <div className="mt-3 space-y-2.5">
        {paraFornecedor.map((d) => (
          <div key={d.nome + (d.fornecedorId ?? '')} className="rounded-xl border border-blue-100 bg-white px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800">
                  {d.fornecedorNome ?? d.nome}
                  {!d.fornecedorNome && <span className="ml-1.5 text-[11px] font-semibold text-amber-600">não identificado</span>}
                </p>
                <p className="text-[11px] text-gray-400">
                  {d.comprovantes} comprovante{d.comprovantes === 1 ? '' : 's'}
                  {d.fornecedorNome && d.fornecedorNome.toUpperCase() !== d.nome ? ` · ${d.nome}` : ''}
                  {d.semValor > 0 ? ` · ${d.semValor} sem valor legível` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold tabular-nums text-blue-700">{fmt(d.total)}</p>
                {d.fornecedorId && <p className="text-[11px] text-gray-400">deve hoje {fmt(d.divida)}</p>}
              </div>
            </div>

            {d.fornecedorId && d.divida > 0.005 ? (
              <BaixaPixForm
                fornecedorId={d.fornecedorId}
                fornecedorNome={d.fornecedorNome ?? d.nome}
                total={d.total}
                divida={d.divida}
                comprovantes={d.comprovantes}
              />
            ) : d.fornecedorId ? (
              <p className="mt-2 border-t border-gray-100 pt-2 text-[11px] text-gray-400">Sem dívida em aberto no app — nada a baixar.</p>
            ) : (
              <p className="mt-2 border-t border-gray-100 pt-2 text-[11px] text-amber-600">
                Cadastre este fornecedor no Financeiro para poder dar baixa na dívida.
              </p>
            )}
          </div>
        ))}
      </div>

      {paraFornecedor.length === 0 && totalGeral <= 0.005 && (
        <p className="mt-3 rounded-xl border border-blue-100 bg-white px-3.5 py-3 text-sm text-gray-500">
          Nenhum comprovante válido para somar neste caixa.
        </p>
      )}

      {totalGeral > 0.005 && (
        <div className="mt-3 space-y-1 border-t border-blue-100 pt-2.5 text-sm">
          {naConta > 0.005 && (
            <div className="flex justify-between text-gray-600">
              <span>💠 Caiu na nossa conta (banco)</span>
              <span className="font-medium tabular-nums">{fmt(naConta)}</span>
            </div>
          )}
          {typeof pixDoCaixa === 'number' && pixDoCaixa > 0.005 && (
            <div className="flex justify-between text-gray-600">
              <span>PIX lançado no caixa</span>
              <span className="font-medium tabular-nums">{fmt(pixDoCaixa)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-blue-900">
            <span>Total de PIX lido hoje</span>
            <span className="tabular-nums">{fmt(totalGeral)}</span>
          </div>
          {typeof pixDoCaixa === 'number' && pixDoCaixa > 0.005 && (() => {
            const dif = Math.round((totalGeral - pixDoCaixa) * 100) / 100
            return Math.abs(dif) < 0.005 ? (
              <p className="text-[11px] font-medium text-green-700">✓ Confere com o PIX lançado no caixa.</p>
            ) : (
              <p className="text-[11px] font-medium text-amber-600">
                Diferença de {fmt(Math.abs(dif))} contra o caixa{dif > 0 ? ' (comprovante a mais)' : ' (comprovante a menos)'} — confira no Telegram antes de baixar.
              </p>
            )
          })()}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-snug text-blue-900/50">
        Dinheiro que o cliente paga direto ao fornecedor não entra na gaveta nem na conta — ele só diminui a dívida.
      </p>

      {/* ERRO HUMANO — o que ficou fora da conta tem nome e valor. Sem esta caixa,
          comprovante repetido ou do grupo errado viraria dívida baixada. */}
      {avisos && (avisos.cruzados + avisos.repetidos + avisos.naoLidos + avisos.semDestino + avisos.naoComprovante + avisos.apagados + (avisos.daSessaoAnterior ?? 0)) > 0 && (
        <div className="mt-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs leading-snug text-amber-800">
          <p className="font-semibold">Conferência dos comprovantes</p>
          {(avisos.daSessaoAnterior ?? 0) > 0 && (
            <p>↩ {avisos.daSessaoAnterior} comprovante{(avisos.daSessaoAnterior ?? 0) === 1 ? '' : 's'} de hoje fic{(avisos.daSessaoAnterior ?? 0) === 1 ? 'ou' : 'caram'} na sessão anterior deste caixa (ele foi fechado no meio do dia). Se a baixa não foi feita antes, faça pelo Financeiro — aqui só aparecem os comprovantes desta sessão.</p>
          )}
          {avisos.cruzados > 0 && (
            <p>⚠ {avisos.cruzados} comprovante{avisos.cruzados === 1 ? '' : 's'} de {fmt(avisos.valorCruzado)} também {avisos.cruzados === 1 ? 'foi postado' : 'foram postados'} no grupo da OUTRA loja. {avisos.cruzados === 1 ? 'Não soma' : 'Não somam'} em nenhuma das duas até decidirem de quem é.</p>
          )}
          {avisos.repetidos > 0 && (
            <p>↺ {avisos.repetidos} comprovante{avisos.repetidos === 1 ? '' : 's'} repetido{avisos.repetidos === 1 ? '' : 's'} de {fmt(avisos.valorRepetido)} — {avisos.repetidos === 1 ? 'contado' : 'contados'} uma vez só.</p>
          )}
          {avisos.naoLidos > 0 && (
            <p>⚠ {avisos.naoLidos} comprovante{avisos.naoLidos === 1 ? '' : 's'} ilegíve{avisos.naoLidos === 1 ? 'l ou não lido' : 'is ou não lidos'} — confira na mão no Telegram.</p>
          )}
          {avisos.semDestino > 0 && (
            <p>⚠ {avisos.semDestino} comprovante{avisos.semDestino === 1 ? '' : 's'} sem o nome de quem recebeu — {fmt(avisos.valorSemDestino)} fora da conta.</p>
          )}
          {avisos.naoComprovante > 0 && (
            <p>🖼 {avisos.naoComprovante} foto{avisos.naoComprovante === 1 ? '' : 's'} que não {avisos.naoComprovante === 1 ? 'era comprovante' : 'eram comprovantes'} — ignorada{avisos.naoComprovante === 1 ? '' : 's'}.</p>
          )}
          {avisos.apagados > 0 && (
            <p>🗑 {avisos.apagados} comprovante{avisos.apagados === 1 ? '' : 's'} apagado{avisos.apagados === 1 ? '' : 's'} do grupo — contam como válidos (o grupo apaga sozinho). Se algum foi CANCELADO, desconte antes de dar baixa.</p>
          )}
        </div>
      )}

      {semLer > 0 && (
        <p className="mt-1 text-[11px] text-amber-600">{semLer} comprovante{semLer === 1 ? '' : 's'} com valor ilegível — confira no Telegram antes de baixar.</p>
      )}
    </div>
  )
}

// Uma linha de baixa = um form. Valor sugerido é o menor entre o que foi pago no
// PIX do dia e a dívida em aberto; a atendente pode corrigir antes de confirmar.
function BaixaPixForm({
  fornecedorId,
  fornecedorNome,
  total,
  divida,
  comprovantes,
}: {
  fornecedorId: string
  fornecedorNome: string
  total: number
  divida: number
  comprovantes: number
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(baixarPixDoFornecedor, null)
  const sugerido = Math.min(total, divida)
  return (
    <form action={withToken(action)} className="mt-2.5 border-t border-gray-100 pt-2.5">
      <input type="hidden" name="pessoa_id" value={fornecedorId} />
      <input type="hidden" name="comprovantes" value={comprovantes} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32">
          <label className="mb-1 block text-[11px] font-medium text-gray-500">Valor a baixar</label>
          <CampoDinheiro name="valor" defaultValue={sugerido} className="py-1.5 text-sm" />
        </div>
        <button
          type="submit"
          disabled={pending}
          aria-label={`Dar baixa na dívida com ${fornecedorNome}`}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Baixando...</span> : 'Dar baixa'}
        </button>
      </div>
      {state && (
        <p className={`mt-1.5 text-xs ${state.ok ? 'text-green-700' : 'text-red-600'}`}>{state.message}</p>
      )}
    </form>
  )
}

// Lista de avisos de regra do caixa (troca de turno, contagem, Pix sem baixa).
// Vermelho = pede ciência explícita de quem fecha; âmbar = só informa.
function ListaAvisos({ avisos }: { avisos: AvisoCaixa[] }) {
  if (avisos.length === 0) return null
  return (
    <div className="space-y-2">
      {avisos.map((a, i) => (
        <div
          key={i}
          className={`rounded-xl border px-4 py-3 text-sm ${
            a.nivel === 'conferir'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <p className="font-semibold">{a.nivel === 'conferir' ? '⛔ ' : '⚠ '}{a.titulo}</p>
          {a.detalhe && <p className="mt-0.5 text-xs leading-snug opacity-90">{a.detalhe}</p>}
        </div>
      ))}
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
  pixDestinos,
  pixAvisos,
  pixFornecedorSemBaixa,
  pixSemComprovante,
  movimentos,
  abertoEm,
  trocoPadrao,
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
  pixDestinos: DestinoNaTela[]
  pixAvisos?: PixAvisos
  pixFornecedorSemBaixa: { total: number; comprovantes: number }
  pixSemComprovante: number
  movimentos: Movimento[]
  abertoEm: string
  trocoPadrao: number
}) {
  const [etapa, setEtapa] = useState<'resumo' | 'cego'>('resumo')
  const [state, action, pending] = useActionState<ActionState, FormData>(fecharCaixa, null)
  // contagem controlada: dá pra avisar "falta X" ANTES de confirmar o fechamento
  const [contado, setContado] = useState(0)
  const [ciente, setCiente] = useState(false)

  const formasEntries = listaPorForma(porForma, valorAbertura)

  // Avisos de regra (troca de turno fecha o caixa mais de uma vez por dia)
  const movimentosSemMotivo = movimentos.filter(
    (m) => ['reforco', 'retirada'].includes(m.tipo) && !(m.motivo ?? '').trim(),
  ).length
  const avisos = avisosDeFechamento({
    abertoEm,
    agora: new Date().toISOString(),
    divergencia: etapa === 'cego' ? Math.round((contado - saldoCaixa) * 100) / 100 : 0,
    pixFornecedorSemBaixa,
    pixSemComprovante,
    movimentosSemMotivo,
    valorAbertura,
    trocoPadrao,
    saldoGaveta: saldoCaixa,
    // na tela de contagem o valor da diferença não aparece: quem está contando
    // não pode saber o esperado (senão ajusta o número e some com a falta).
    divergenciaComValor: false,
  })
  const exigeCiencia = precisaCiencia(avisos)

  // Etapa 1 — resumo do dia (operador vê tudo antes de contar)
  if (etapa === 'resumo') {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fechamento de Caixa</p>
          <p className="text-sm text-gray-500 mt-0.5">Cada forma se confere no seu lugar — a contagem da gaveta é só o dinheiro</p>
        </div>

        {/* Dinheiro a separar no envelope: gaveta − troco que fica. Os outros
            tipos (PIX, cartão, fiado, vale) seguem no card abaixo. */}
        <div className="px-6 py-4 border-b border-gray-100 bg-emerald-50/70">
          <div className="flex justify-between text-sm text-emerald-800">
            <span>Total na gaveta (dinheiro)</span>
            <span className="tabular-nums font-semibold">{fmt(saldoCaixa)}</span>
          </div>
          <div className="flex justify-between text-sm text-emerald-800">
            <span>Troco (fica pra amanhã)</span>
            <span className="tabular-nums">− {fmt(valorAbertura)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-emerald-300 pt-2">
            <span className="text-base font-bold text-emerald-900">Separar no envelope</span>
            <span className="text-2xl font-extrabold tabular-nums text-emerald-800">{fmt(saldoCaixa - valorAbertura)}</span>
          </div>
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Por Forma — o que deve ter em cada lugar</p>
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

          {/* PIX do dia — para onde foi, lido dos comprovantes do Telegram.
              Só aparece quando o bot já leu algum comprovante deste caixa. */}
          {(pixDestinos.length > 0 || (pixAvisos ? (pixAvisos.cruzados + pixAvisos.repetidos + pixAvisos.naoLidos + pixAvisos.semDestino + pixAvisos.naoComprovante + (pixAvisos.daSessaoAnterior ?? 0)) > 0 : false)) && (
            <PixDoDiaCard destinos={pixDestinos} pixDoCaixa={porTipo['pix'] ?? 0} avisos={pixAvisos} />
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          {/* Avisos de regra — a troca de funcionário fecha o caixa mais de uma
              vez por dia, então o que é fácil de esquecer aparece aqui ANTES. */}
          <ListaAvisos avisos={avisos} />
          <div className="flex items-center justify-between gap-4">
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
        <input type="hidden" name="ciente" value={exigeCiencia ? (ciente ? '1' : '0') : '0'} />

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            Dinheiro Contado na Gaveta (R$)
          </label>
          <CampoDinheiro name="valor_fechamento" value={contado} onChange={setContado} autoFocus required className="text-xl" />
          <p className="text-xs text-gray-400 mt-1">Só cédulas e moedas — PIX, cartão e fiado não entram (conferem no WhatsApp e na maquininha)</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
          <input name="obs_fechamento" className="field" placeholder="Opcional" />
        </div>

        <ListaAvisos avisos={avisos} />

        {exigeCiencia && (
          <label className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <input
              type="checkbox"
              checked={ciente}
              onChange={(e) => setCiente(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
            />
            <span>Li os avisos acima e quero fechar o caixa assim mesmo. Sei que o que ficou pendente aparece no relatório com o meu nome.</span>
          </label>
        )}

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
            disabled={pending || (exigeCiencia && !ciente)}
            className="flex-1 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Fechando...</span> : 'Confirmar Fechamento'}
          </button>
        </div>
        {exigeCiencia && !ciente && (
          <p className="text-center text-xs text-red-600">Marque a caixa de ciência para liberar o fechamento.</p>
        )}
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
  totalTaxaCartao,
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
  totalTaxaCartao: number
  vendasPorTipo: Record<string, VendaConferencia[]>
  reforcosDinheiro: number
  retiradasDinheiro: number
  recebidosDinheiro: number
  vendasDia: VendaDia[]
}) {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const reforcos = movimentos.filter((m) => m.tipo === 'reforco')
  const retiradas = movimentos.filter((m) => m.tipo === 'retirada')

  // A linha do Dinheiro soma a ABERTURA: quem confere quer ver o que tem que
  // ter em cada lugar agora (gaveta = 556, não "quanto vendi em dinheiro").
  // Pedido do dono 27/08: "é pra ter 556 no dinheiro ali". As outras formas
  // não têm abertura — cartão/PIX não começam o dia com troco.
  const formasOrdenadas = listaPorForma(porForma, caixaAberto.valor_abertura)
  // base do % = a soma do que está listado. Usar totalVendas fazia as barras
  // mentirem, porque essas linhas incluem fiado pago (que não é venda de hoje)
  // e agora a abertura.
  const baseFormas = formasOrdenadas.reduce((s, [, v]) => s + v, 0)

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
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Por Forma — o que deve ter em cada lugar</p>
          {formasOrdenadas.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Nenhuma venda registrada</p>
          ) : (
            <div className="space-y-3">
              {formasOrdenadas.map(([forma, valor]) => {
                const pct = baseFormas > 0 ? (valor / baseFormas) * 100 : 0
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
          <p className="mt-3 text-xs text-gray-400">
            Inclui <b>fiado pago hoje</b> (dívida antiga que entrou) e, no Dinheiro, a <b>abertura</b> — é o que
            deve estar em cada lugar agora, não o quanto foi vendido.
            {totalTaxaCartao > 0.005 && (
              <> Cartão é o líquido que cai pra loja; a maquininha cobrou <span className="font-semibold text-gray-600">{fmt(totalTaxaCartao)}</span> a mais de taxa hoje — bata Cartão + essa taxa contra o extrato.</>
            )}
          </p>
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
                      // Soma o que a venda TROUXE de dinheiro — não o total dela.
                      // Fiado já pago entra (o dinheiro entrou); venda mista entra
                      // só na parte recebida; fiado em aberto não entra.
                      const recebido = v.recebido ?? 0
                      saldo += recebido
                      const soDivida = recebido <= 0.005
                      const parcial = !soDivida && recebido < v.total - 0.005
                      return (
                        <tr key={v.id} className="hover:bg-blue-50/60">
                          <td className="py-1.5 pr-3 font-mono text-gray-500 text-xs">{v.id.slice(-6).toUpperCase()}</td>
                          <td className="py-1.5 pr-3 text-gray-500">{fmtHora(v.created_at)}</td>
                          <td className="py-1.5 pr-3 text-gray-700">
                            {/* venda mista não tem forma única no banco (fica NULL) e
                                caía em "Outras" — mostra as formas de verdade. */}
                            {v.formas && v.formas.length > 0 ? v.formas.join(' + ') : (v.forma_pagamento ?? '—')}
                            {parcial && <span className="ml-1.5 rounded bg-gray-100 px-1 text-[10px] text-gray-500">entrou {fmt(recebido)}</span>}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-semibold text-gray-900">{fmt(v.total)}</td>
                          <td className={`py-1.5 text-right font-semibold ${soDivida ? 'text-orange-500' : 'text-green-600'}`}>{fmt(saldo)}</td>
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
      <div className="rounded-xl bg-cyan-50 px-4 py-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-cyan-800">Vendas do turno (sem troco)</span>
          <span className="font-semibold text-cyan-700 tabular-nums">{fmt(saldoTotal - caixaAberto.valor_abertura)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-cyan-800">Troco (fundo)</span>
          <span className="tabular-nums text-cyan-600">{fmt(caixaAberto.valor_abertura)}</span>
        </div>
        <div className="flex justify-between font-bold border-t border-cyan-200 pt-1.5">
          <span className="text-cyan-900">Total (com troco)</span>
          <span className="text-cyan-700 tabular-nums">{fmt(saldoTotal)}</span>
        </div>
      </div>
      {Object.keys(porForma).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Por Forma — o que deve ter em cada lugar</p>
          <div className="space-y-1">
            {listaPorForma(porForma, caixaAberto.valor_abertura).map(([forma, valor]) => (
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
    totalTaxaCartao: number
    estornosPix?: number
    movimentos: { tipo: string; motivo: string | null; forma_pagamento: string; valor: number; created_at: string }[]
    valorEsperado: number
    valorContado: number
    operador: string
  }
}) {
  const divergencia = z.valorContado - z.valorEsperado
  const zerado = Math.abs(divergencia) <= 0.01
  const separar = z.valorEsperado - z.valor_abertura

  const fmtDt = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@media print { body * { visibility: hidden !important; } #z-report, #z-report * { visibility: visible !important; color: #000 !important; } #z-report { position: absolute; top: 0; left: 0; width: 100%; } }` }} />

      {/* botão fora da área de impressão */}
      <div className="mb-3 flex justify-end print:hidden">
        <button onClick={() => window.print()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">🖨️ Imprimir</button>
      </div>

      {/* Nota térmica 80mm — só preto, alto contraste */}
      <div id="z-report" className="mx-auto w-full max-w-[72mm] bg-white p-3 text-black" style={{ fontFamily: 'monospace' }}>
        {/* Cabeçalho */}
        <div className="border-b-2 border-black pb-2 mb-3 text-center">
          <p className="text-base font-extrabold tracking-wide">TECNOCELL</p>
          <p className="text-sm font-bold">FECHAMENTO DE CAIXA</p>
          <p className="mt-1 text-xs">{fmtDt(z.fechado_em)}</p>
          <p className="text-xs">Operador: {z.operador}</p>
        </div>

        {(z.estornosPix ?? 0) > 0 && <p className="mb-3 text-sm">Estorno PIX: −{fmt(z.estornosPix ?? 0)} (já descontado; fora da gaveta)</p>}
        {/* Resumo da gaveta */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span>Troco (fica)</span>
            <span className="font-bold tabular-nums">{fmt(z.valor_abertura)}</span>
          </div>
          <div className="flex justify-between">
            <span>Separar no envelope</span>
            <span className="font-bold tabular-nums">{fmt(separar)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-black pt-1.5 text-base font-extrabold">
            <span>Dinheiro na gaveta</span>
            <span className="tabular-nums">{fmt(z.valorEsperado)}</span>
          </div>
        </div>

        {/* Conferência */}
        <div className="mt-3 space-y-1.5 border-t border-black pt-2 text-sm">
          <div className="flex justify-between">
            <span>Contado</span>
            <span className="font-bold tabular-nums">{fmt(z.valorContado)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Diferença</span>
            <span className="tabular-nums">{divergencia > 0 ? '+' : ''}{fmt(divergencia)}{zerado ? ' ✓' : ''}</span>
          </div>
        </div>

        {z.obs_fechamento && <p className="mt-3 text-xs">Obs: {z.obs_fechamento}</p>}

        {/* Assinaturas */}
        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
          <div><div className="border-t border-black pt-1">Operador</div></div>
          <div><div className="border-t border-black pt-1">Supervisor</div></div>
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
  totalTaxaCartao,
  vendasPorTipo,
  vendasDetalhe,
  pixPendentes,
  pixDestinos = [],
  pixAvisos,
  pixFornecedorSemBaixa = { total: 0, comprovantes: 0 },
  trocoPadrao = 0,
  estornosPix = 0,
  estornosSemSplit = 0,
  erro,
  fechado,
  aberto,
  zReport,
}: Props) {
  const router = useRouter()
  const [panel, setPanel] = useState<Panel>(null)
  // "Vendas deste caixa" recolhe (dia cheio some da tela) e pagina (dia com
  // 150 vendas não vira uma rolagem infinita).
  const [vendasAbertas, setVendasAbertas] = useState(true)
  const [paginaVendas, setPaginaVendas] = useState(0)
  const VENDAS_POR_PAGINA = 20
  const toggle = (p: Panel) => setPanel((prev) => (prev === p ? null : p))
  // carrega o token do navegador 1x → o withToken usa ele síncrono no submit
  useEffect(() => { authToken().then((t) => { tokenCache = t }) }, [])

  // Dinheiro PRIMEIRO — reforço/sangria é quase sempre em espécie, e o <select> usa o 1º
  // como padrão. Antes ficava "Crédito PagBank" (as formas vêm ordenadas por nome), então
  // a operadora fazia um reforço/retirada em cartão sem querer e não mexia na gaveta (Isa 29/07).
  const formasFisicas = formas
    .filter((f) => !FORMAS_INVALIDAS.some((inv) => f.includes(inv)))
    .sort((a, b) => (/dinheiro/i.test(a) ? -1 : /dinheiro/i.test(b) ? 1 : 0))
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
  // Tudo que o turno produziu (vendas de todas as formas, incl. fiado) — visão gerencial.
  // Reforço/sangria contam SÓ em dinheiro (igual à gaveta e à devolução): reforço/sangria
  // em cartão/PIX não é dinheiro que o turno produziu — antes inflava este total (Isa 29/07).
  const saldoTotal =
    (caixaAberto?.valor_abertura ?? 0) + totalVendas + reforcosDinheiro - retiradasDinheiro - totalDevolucoes
  // Caixa aberto num dia e ainda aberto no seguinte = bagunça na conferência.
  const caixaEhDeOntem =
    caixaAberto &&
    new Date(caixaAberto.aberto_em).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) !==
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

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

      {caixaAberto && estornosPix > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-4 text-blue-900">
          <p className="font-bold">Pix devolvido neste caixa: −{fmt(estornosPix)}</p>
          <p className="text-sm">Já descontado do total e do Pix a conferir. Não sai dinheiro da gaveta.</p>
        </div>
      )}
      {caixaAberto && estornosSemSplit > 0 && (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          Há {estornosSemSplit} devolução(ões) antiga(s) sem divisão do reembolso. Confira o financeiro antes de fechar.
        </p>
      )}
      {caixaAberto && pixPendentes.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-6 py-4">
          <p className="font-bold text-amber-800">⚠️ {pixPendentes.length} PIX sem comprovante</p>
          <p className="mt-1 text-sm text-amber-700">PIX no sistema que ainda não tem comprovante no WhatsApp/Telegram. Confira antes de fechar o caixa:</p>
          <ul className="mt-2 space-y-1 text-sm">
            {pixPendentes.map((p, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span className="text-amber-900">{p.cliente ?? 'Sem cliente'} <span className="text-amber-500">· {fmtHora(p.hora)}</span></span>
                <span className="font-semibold text-amber-700 tabular-nums">{fmt(p.valor)}</span>
              </li>
            ))}
          </ul>
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
          {caixaEhDeOntem && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              ⚠️ Caixa aberto desde {fmtDate(caixaAberto.aberto_em)} — está de ontem. Feche antes de continuar vendendo.
            </div>
          )}
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
              pixDestinos={pixDestinos}
              pixAvisos={pixAvisos}
              pixFornecedorSemBaixa={pixFornecedorSemBaixa}
              pixSemComprovante={pixPendentes.length}
              movimentos={movimentos}
              abertoEm={caixaAberto.aberto_em}
              trocoPadrao={trocoPadrao}
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
              totalTaxaCartao={totalTaxaCartao}
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
              <button type="button" onClick={() => setVendasAbertas((v) => !v)}
                className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50/70 transition text-left">
                <div>
                  <h3 className="font-semibold text-gray-800">Vendas deste caixa</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Cada venda com as formas que a pagaram</p>
                </div>
                <span className="flex items-center gap-2 text-xs text-gray-400">
                  {qtdVendas} venda{qtdVendas !== 1 ? 's' : ''} · {fmt(totalVendas)}
                  <span className="text-blue-600 font-semibold">{vendasAbertas ? '▾ recolher' : '▸ mostrar'}</span>
                </span>
              </button>
              <div className={vendasAbertas ? 'contents' : 'hidden'}>
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
                    {vendasDetalhe.slice(paginaVendas * VENDAS_POR_PAGINA, (paginaVendas + 1) * VENDAS_POR_PAGINA).map((v) => (
                      // A venda inteira leva pro Painel de Vendas com ela ABERTA (deep-link
                      // ?venda=). O Vitor confere o PIX aqui e clica pra ver os itens/comprovante.
                      <tr
                        key={v.id}
                        onClick={() => router.push(`/painel/vendas?venda=${v.id}`)}
                        className="group cursor-pointer hover:bg-blue-50/50 transition"
                      >
                        <td className="px-6 py-2.5">
                          <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-blue-700 group-hover:text-blue-900 group-hover:underline">
                            {v.numero ? `#${v.numero}` : v.id.slice(-6).toUpperCase()}
                            <svg className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{fmtHora(v.hora)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{v.cliente ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {v.devolvida && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
                                ↩ Devolvida — fiado cancelado
                              </span>
                            )}
                            {!v.devolvida && v.pagamentos.length === 0 && <span className="text-gray-300">—</span>}
                            {v.pagamentos.map((pg, i) => (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${corDoTipo(pg.tipo)}`}
                              >
                                {iconeDoTipo(pg.tipo)} {pg.tipo === 'fiado' ? labelTipoPagamento(pg.tipo) : pg.nome}
                                {v.pagamentos.length > 1 && <b className="tabular-nums">{fmt(pg.valor)}</b>}
                              </span>
                            ))}
                            {/* A tag "Crédito Loja (Fiado)" acima é a forma ORIGINAL da
                                venda e nunca muda — mesmo depois de paga. Sem isto, quem
                                confere o caixa via essa venda como dívida em aberto, sem
                                saber que o mesmo valor já apareceu como "Fiado recebido"
                                na conferência de Dinheiro/PIX logo abaixo. (achado no
                                check-up de 27/08) */}
                            {v.fiadoAbatido > 0.005 && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                                🤝 Fiado abatido {fmt(v.fiadoAbatido)}
                                {v.fiadoAbatido < v.fiadoValor - 0.005 && ` de ${fmt(v.fiadoValor)}`}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Devolvida: valor riscado e apagado — ele NÃO entra no
                            total do turno lá em cima, então mostrar em preto
                            forte fazia a soma da tela nunca fechar. */}
                        <td className={`px-6 py-2.5 text-right font-bold tabular-nums ${v.devolvida ? 'text-gray-300 line-through' : 'text-gray-900'}`}>{fmt(v.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Sem isto um dia de 150 vendas virava uma rolagem infinita. */}
              {vendasDetalhe.length > VENDAS_POR_PAGINA && (
                <div className="flex items-center justify-between border-t border-gray-100 px-6 py-2.5">
                  <button type="button" disabled={paginaVendas === 0}
                    onClick={() => setPaginaVendas((p) => Math.max(0, p - 1))}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed">
                    ← anteriores
                  </button>
                  <span className="text-xs text-gray-400">
                    Página {paginaVendas + 1} de {Math.ceil(vendasDetalhe.length / VENDAS_POR_PAGINA)}
                  </span>
                  <button type="button" disabled={(paginaVendas + 1) * VENDAS_POR_PAGINA >= vendasDetalhe.length}
                    onClick={() => setPaginaVendas((p) => p + 1)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed">
                    próximas →
                  </button>
                </div>
              )}
              <p className="border-t border-gray-100 px-6 py-2.5 text-[11px] text-gray-400">
                Venda com mais de uma etiqueta foi paga em formas diferentes — o valor de cada uma aparece na etiqueta.
              </p>
              </div>
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
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Abertura</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Fechamento</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Inicial</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Final</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Vendido no dia</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {historico.map((c) => {
              const spansDay =
                c.fechado_em &&
                new Date(c.aberto_em).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) !==
                  new Date(c.fechado_em).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
              const vendido = c.valor_fechamento != null ? c.valor_fechamento - (c.valor_abertura ?? 0) : null
              return (
                <tr key={c.id} className={`transition ${
                  spansDay ? 'bg-amber-50 hover:bg-amber-100/70' : 'hover:bg-blue-50/60'
                }`}>
                  <td className="px-3 py-2 text-sm text-gray-600">{fmtDate(c.aberto_em)}</td>
                  <td className="px-3 py-2 text-sm text-gray-500">
                    {c.fechado_em ? fmtDate(c.fechado_em) : '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-right text-gray-700 tabular-nums">
                    {fmt(c.valor_abertura ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-sm text-right text-gray-700 tabular-nums">
                    {c.valor_fechamento != null ? fmt(c.valor_fechamento) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-sm text-right font-semibold tabular-nums ${
                    vendido == null ? 'text-gray-300' : vendido >= 0 ? 'text-green-700' : 'text-red-500'
                  }`}>
                    {vendido != null ? fmt(vendido) : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.status === 'aberto' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
