'use client'

import { Spinner } from '@/components/Spinner'
import { useActionState } from 'react'
import { salvarConfiguracoes } from './actions'

export function ConfigForm({ dados, dadosPdv }: { dados: Record<string, string>; dadosPdv: Record<string, number> }) {
  const [state, formAction, pending] = useActionState(salvarConfiguracoes, { ok: false, erro: null })

  // Scroll to top so success/error message is visible
  if (state.ok || state.erro) {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <form action={formAction} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
      {state.ok && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Configurações salvas com sucesso!
        </div>
      )}
      {state.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.erro}</div>
      )}

      <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-3">Dados da Empresa</h3>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome da Empresa</label>
          <input name="nome_empresa" defaultValue={dados.nome_empresa ?? ''} className="field" placeholder="TecnoCell" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">CNPJ</label>
          <input name="cnpj" defaultValue={dados.cnpj ?? ''} className="field" placeholder="00.000.000/0001-00" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Telefone</label>
          <input name="telefone" defaultValue={dados.telefone ?? ''} className="field" placeholder="(24) 3333-3333" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Endereço</label>
          <input name="endereco" defaultValue={dados.endereco ?? ''} className="field" placeholder="Rua, número, bairro" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Cidade</label>
          <input name="cidade" defaultValue={dados.cidade ?? ''} className="field" placeholder="Petrópolis" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Estado</label>
          <input name="estado" defaultValue={dados.estado ?? ''} className="field" placeholder="RJ" maxLength={2} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Site</label>
          <input name="site" defaultValue={dados.site ?? ''} className="field" placeholder="www.tecnocellpetropolis.com.br" />
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-3 pt-2">Configurações do Sistema</h3>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Moeda</label>
          <select name="moeda" defaultValue={dados.moeda ?? 'BRL'} className="field">
            <option value="BRL">Real (BRL)</option>
            <option value="USD">Dólar (USD)</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Fuso Horário</label>
          <select name="timezone" defaultValue={dados.timezone ?? 'America/Sao_Paulo'} className="field">
            <option value="America/Sao_Paulo">São Paulo (GMT-3)</option>
            <option value="America/Manaus">Manaus (GMT-4)</option>
            <option value="America/Belem">Belém (GMT-3)</option>
          </select>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-3 pt-2">PDV / Caixa</h3>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Limite de divergência no fechamento (R$)</label>
          <input
            name="limite_divergencia"
            type="number"
            step="0.01"
            min="0"
            defaultValue={dadosPdv.limite_divergencia ?? 0}
            className="field"
            placeholder="0 = sem limite"
          />
          <p className="text-xs text-gray-400 mt-1">Bloqueia o fechamento se a diferença entre contado e esperado ultrapassar este valor. Zero desativa o bloqueio.</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Comissão das vendedoras (%)</label>
          <input
            name="comissao_percentual"
            type="number"
            step="0.1"
            min="0"
            max="100"
            defaultValue={dadosPdv.comissao_percentual ?? 0}
            className="field"
            placeholder="Ex: 2"
          />
          <p className="text-xs text-gray-400 mt-1">% global sobre o total vendido, igual pra todas. Aparece no Painel de Vendas. Zero desativa.</p>
        </div>
      </div>

      <div className="pt-2">
        <button type="submit" disabled={pending}
          className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">
          {pending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Salvando...</span> : 'Salvar Configurações'}
        </button>
      </div>
    </form>
  )
}
