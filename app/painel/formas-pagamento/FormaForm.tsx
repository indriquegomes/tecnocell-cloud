'use client'

import { useState } from 'react'
import Link from 'next/link'
import { criarFormaPagamento, editarFormaPagamento } from './actions'
import { TIPOS_PAGAMENTO, PRAZOS_RECEBIMENTO, tipoUsaMaquina } from '@/lib/formas-pagamento'

type Maquina = { id: string; nome: string; taxa_debito: number; taxas_credito: number[]; max_parcelas: number }
type Conta = { id: string; nome: string; tipo: string }
type Editando = { id: string; nome: string; tipo: string; ativo: boolean; maquina_id: string | null; prazo_recebimento: string | null; conta_destino_id: string | null }

// Explicação em português de gente — o que acontece com o dinheiro em cada tipo
const COMO_FUNCIONA: Record<string, string> = {
  dinheiro: 'O cliente paga em espécie. O sistema calcula o troco e o dinheiro fica no caixa da loja.',
  pix: 'O cliente transfere na hora, sem taxa. O valor cai direto na conta do seu banco.',
  cartao_debito: 'Passa na maquininha. A operadora desconta a taxa de débito e o valor cai na conta em ~1 dia útil.',
  cartao_credito: 'Passa na maquininha e pode parcelar. A taxa cresce conforme o número de parcelas. O valor cai em ~30 dias (ou parcela a parcela).',
  fiado: 'O cliente leva agora e paga depois. Vira uma pendência "a receber" no Financeiro, no nome dele.',
  outro: 'Sem regra especial no PDV.',
}

function resumoMaquina(m: Maquina): string {
  const t = (m.taxas_credito ?? []).slice(0, m.max_parcelas).filter((x) => x > 0)
  const faixa = t.length ? `${Math.min(...t)}%–${Math.max(...t)}%` : '—'
  return `Débito ${m.taxa_debito}% · Crédito ${faixa} · até ${m.max_parcelas}x`
}

export function FormaForm({ maquinas, contas, editando, lockTipo }: { maquinas: Maquina[]; contas: Conta[]; editando?: Editando; lockTipo?: boolean }) {
  const [tipo, setTipo] = useState(editando?.tipo ?? '')
  const [maquinaSel, setMaquinaSel] = useState(editando?.maquina_id ?? '')
  const usaMaquina = tipoUsaMaquina(tipo)
  const isFiado = tipo === 'fiado'
  const action = editando ? editarFormaPagamento.bind(null, editando.id) : criarFormaPagamento
  const descTipo = TIPOS_PAGAMENTO.find((t) => t.key === tipo)?.desc
  const labelTipo = TIPOS_PAGAMENTO.find((t) => t.key === tipo)?.label ?? '—'
  const explicacao = tipo ? COMO_FUNCIONA[tipo] : null

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">
        {editando ? `Configurando: ${editando.nome}` : 'Nova variação'}
      </h3>
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Nome *</label>
            <input name="nome" required defaultValue={editando?.nome ?? ''} className="field" placeholder="Ex: PIX Loja, Cartão Stone" />
            <p className="mt-1 text-[11px] text-gray-400">Rótulo que aparece no PDV. Pode repetir o tipo (ex: dois PIX de contas diferentes).</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Tipo *</label>
            {lockTipo ? (
              <>
                <div className="field flex items-center bg-gray-50 text-gray-500">{labelTipo}</div>
                <input type="hidden" name="tipo" value={tipo} />
              </>
            ) : (
              <select name="tipo" required value={tipo} onChange={(e) => setTipo(e.target.value)} className="field">
                <option value="" disabled>Selecione</option>
                {TIPOS_PAGAMENTO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            )}
            <p className="mt-1 text-[11px] text-gray-400">{lockTipo ? 'Essencial — o tipo é fixo.' : (descTipo ? `Comportamento: ${descTipo}.` : 'Define o que o sistema faz no PDV.')}</p>
          </div>
        </div>

        {/* Como funciona — explicação humana do fluxo do dinheiro */}
        {explicacao && (
          <div className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <span>💡</span>
            <p>{explicacao}</p>
          </div>
        )}

        {/* Máquina — cards com as taxas que já estão cadastradas */}
        {usaMaquina && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Qual maquininha processa este cartão?</label>
            <input type="hidden" name="maquina_id" value={maquinaSel} />
            <div className="grid gap-2 sm:grid-cols-2">
              {maquinas.map((m) => (
                <button key={m.id} type="button" onClick={() => setMaquinaSel(m.id)}
                  className={`rounded-xl border p-3 text-left transition ${maquinaSel === m.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <p className="text-sm font-semibold text-gray-800">{m.nome}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">{resumoMaquina(m)}</p>
                </button>
              ))}
              <button type="button" onClick={() => setMaquinaSel('')}
                className={`rounded-xl border p-3 text-left transition ${maquinaSel === '' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <p className="text-sm font-semibold text-gray-800">Perguntar na venda</p>
                <p className="mt-0.5 text-[11px] text-gray-500">O vendedor escolhe a maquininha na hora</p>
              </button>
            </div>
            {maquinas.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">Nenhuma maquininha cadastrada ainda. Vá em Máquinas de Cartão.</p>
            )}
            <p className="mt-1 text-[11px] text-gray-400">A taxa e as parcelas vêm daqui automático no PDV. Valores editáveis em Máquinas de Cartão.</p>
          </div>
        )}

        {/* Fiado é diferente — não entra dinheiro em conta nenhuma */}
        {isFiado && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Fiado não entra em conta — vira uma dívida <strong>&ldquo;a receber&rdquo;</strong> no nome do cliente (crediário). Por isso não tem máquina nem destino de dinheiro.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Pra onde vai o dinheiro — não se aplica ao fiado */}
          {tipo && !isFiado && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Pra onde vai o dinheiro?</label>
              <select name="conta_destino_id" defaultValue={editando?.conta_destino_id ?? ''} className="field">
                <option value="">— não definido —</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.tipo === 'caixa' ? '💵' : '🏦'} {c.nome}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">Onde esse valor fica de verdade. Cadastre em Financeiro → Contas.</p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Prazo de recebimento</label>
            <select name="prazo_recebimento" defaultValue={editando?.prazo_recebimento ?? 'a_vista'} className="field">
              {PRAZOS_RECEBIMENTO.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">Quando o dinheiro entra de verdade.</p>
          </div>

          {editando && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Status</label>
              <select name="ativo" defaultValue={String(editando.ativo)} className="field">
                <option value="true">Ativo (aparece no PDV)</option>
                <option value="false">Inativo (escondido)</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            {editando ? 'Salvar' : 'Adicionar'}
          </button>
          {editando && (
            <Link href="/painel/formas-pagamento" className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              Cancelar
            </Link>
          )}
        </div>
      </form>
    </div>
  )
}
