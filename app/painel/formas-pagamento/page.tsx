import { createServiceClient } from '@/lib/supabase/server'
import { IconCard } from '@/components/icons'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { deletarFormaPagamento } from './actions'
import { labelTipoPagamento, labelPrazo } from '@/lib/formas-pagamento'
import { FormaForm } from './FormaForm'
import { Dica } from '@/components/Dica'
import Link from 'next/link'

type Maquina = { id: string; nome: string; taxa_debito: number; taxas_credito: number[]; max_parcelas: number }
type Conta = { id: string; nome: string; tipo: string }
type Forma = { id: string; nome: string; tipo: string; ativo: boolean; maquina_id: string | null; prazo_recebimento: string | null; conta_destino_id: string | null }

// Formas que trazem dinheiro de verdade (têm conta destino)
const RECEBIMENTOS: { tipo: string; icon: string }[] = [
  { tipo: 'pix', icon: '⚡' },
  { tipo: 'dinheiro', icon: '💵' },
  { tipo: 'cartao_debito', icon: '💳' },
  { tipo: 'cartao_credito', icon: '💳' },
]

function descricao(f: Forma | undefined, maq: Maquina | undefined): { texto: string; alerta?: boolean } {
  if (!f) return { texto: 'Não configurado', alerta: true }
  if (f.tipo === 'dinheiro') return { texto: 'Dá troco no PDV' }
  if (f.tipo === 'pix') return { texto: 'À vista, sem taxa' }
  if (f.tipo === 'fiado') return { texto: 'Vira pendência a receber' }
  if (f.tipo === 'cartao_debito' || f.tipo === 'cartao_credito') {
    if (!f.maquina_id || !maq) return { texto: 'Máquina: perguntar na venda' }
    if (f.tipo === 'cartao_debito') return { texto: `${maq.nome} · déb ${maq.taxa_debito}%` }
    const t = (maq.taxas_credito ?? []).slice(0, maq.max_parcelas).filter((x) => x > 0)
    const faixa = t.length ? `${Math.min(...t)}–${Math.max(...t)}%` : '0%'
    return { texto: `${maq.nome} · créd ${faixa}` }
  }
  return { texto: '—' }
}

export default async function FormasPagamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; editar?: string; novo?: string }>
}) {
  const { erro, editar, novo } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: formasData }, { data: maquinasData }, { data: contasData }] = await Promise.all([
    supabase.from('formas_pagamento').select('id, nome, tipo, ativo, maquina_id, prazo_recebimento, conta_destino_id').order('nome'),
    supabase.from('maquinas_cartao').select('id, nome, taxa_debito, taxas_credito, max_parcelas').eq('ativo', true).order('nome'),
    supabase.from('contas').select('id, nome, tipo').eq('ativa', true).order('created_at'),
  ])

  const formas = (formasData ?? []) as Forma[]
  const maquinas = (maquinasData ?? []) as Maquina[]
  const contas = (contasData ?? []) as Conta[]
  const maqById = new Map(maquinas.map((m) => [m.id, m]))
  const contaById = new Map(contas.map((c) => [c.id, c]))

  // Casa cada tipo de recebimento com sua forma; Fiado é separado; o resto é "variação extra"
  const usados = new Set<string>()
  const recebimentos = RECEBIMENTOS.map((e) => {
    const forma = formas.find((f) => f.tipo === e.tipo && !usados.has(f.id))
    if (forma) usados.add(forma.id)
    return { ...e, forma }
  })
  const fiado = formas.find((f) => f.tipo === 'fiado' && !usados.has(f.id))
  if (fiado) usados.add(fiado.id)
  const extras = formas.filter((f) => !usados.has(f.id))

  const editando = editar ? formas.find((f) => f.id === editar) : undefined
  const lockTipo = editando ? usados.has(editando.id) : false
  const mostrarForm = Boolean(editando) || novo === '1'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconCard className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Formas de Pagamento</h2>
        <Dica texto="Recebimentos trazem dinheiro e caem numa Conta (Caixa ou banco). Fiado é diferente: não entra dinheiro, vira 'a receber' do cliente. Variações extras (ex: 2º PIX) você adiciona embaixo." />
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      {/* Form aparece só ao configurar/adicionar */}
      {mostrarForm && <FormaForm maquinas={maquinas} contas={contas} editando={editando} lockTipo={lockTipo} />}

      {/* Recebimentos — trazem dinheiro, têm conta destino */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Recebimentos</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {recebimentos.map((e) => {
            const f = e.forma
            const d = descricao(f, f?.maquina_id ? maqById.get(f.maquina_id) : undefined)
            const prazo = f && f.prazo_recebimento !== 'a_vista' ? labelPrazo(f.prazo_recebimento) : null
            const conta = f?.conta_destino_id ? contaById.get(f.conta_destino_id) : undefined
            const inativo = f && !f.ativo
            return (
              <div key={e.tipo} className={`rounded-xl border bg-white p-4 shadow-sm ${inativo ? 'border-gray-200 opacity-60' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <span className="text-lg">{e.icon}</span>
                      <span className="truncate">{f?.nome ?? labelTipoPagamento(e.tipo)}</span>
                      {inativo && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">inativo</span>}
                    </p>
                    <p className={`mt-1 text-xs ${d.alerta ? 'text-amber-600' : 'text-gray-500'}`}>{d.alerta && '⚠ '}{d.texto}</p>
                    {f && (conta
                      ? <p className="mt-0.5 text-[11px] text-gray-400">Vai para: {conta.tipo === 'caixa' ? '💵' : '🏦'} {conta.nome}</p>
                      : <p className="mt-0.5 text-[11px] text-amber-600">⚠ destino não definido</p>
                    )}
                    {prazo && <p className="mt-0.5 text-[11px] text-gray-400">Recebe: {prazo}</p>}
                  </div>
                  {f ? (
                    <Link href={`/painel/formas-pagamento?editar=${f.id}`}
                      className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
                      Configurar
                    </Link>
                  ) : (
                    <span className="shrink-0 text-xs text-gray-400">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Fiado — não é recebimento, é 'a receber' */}
      {fiado && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Fiado (a receber)</h3>
          <div className={`rounded-xl border border-amber-200 bg-amber-50 p-4 ${!fiado.ativo ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <span className="text-lg">🧾</span>
                  <span className="truncate">{fiado.nome}</span>
                  {!fiado.ativo && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">inativo</span>}
                </p>
                <p className="mt-1 text-xs text-amber-700">Não entra dinheiro — vira dívida do cliente no Financeiro (crediário). Sem conta destino.</p>
              </div>
              <Link href={`/painel/formas-pagamento?editar=${fiado.id}`}
                className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition">
                Configurar
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Variações extras */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Variações extras</h3>
          {!mostrarForm && (
            <Link href="/painel/formas-pagamento?novo=1"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition">
              + Adicionar
            </Link>
          )}
        </div>
        {extras.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
            Nenhuma variação. Os 5 essenciais já cobrem o dia a dia.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <tbody className="divide-y divide-gray-50">
                {extras.map((f) => {
                  const d = descricao(f, f.maquina_id ? maqById.get(f.maquina_id) : undefined)
                  const conta = f.tipo === 'fiado' ? null : (f.conta_destino_id ? contaById.get(f.conta_destino_id) : undefined)
                  return (
                    <tr key={f.id} className="hover:bg-blue-50/60 transition">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{f.nome}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{labelTipoPagamento(f.tipo)}</td>
                      <td className={`px-4 py-3 text-sm ${d.alerta ? 'text-amber-600' : 'text-gray-500'}`}>{d.texto}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {f.tipo === 'fiado' ? '—' : (conta ? `${conta.tipo === 'caixa' ? '💵' : '🏦'} ${conta.nome}` : <span className="text-amber-600">sem destino</span>)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${f.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {f.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link href={`/painel/formas-pagamento?editar=${f.id}`}
                            className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition">
                            Editar
                          </Link>
                          <BotaoExcluir action={deletarFormaPagamento.bind(null, f.id)} mensagem="Excluir esta variação?" />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
