'use client'

import { useState } from 'react'

export function ConfigForm({ dados }: { dados: Record<string, string> }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'erro'>('idle')
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('saving')
    setErro('')

    const form = e.currentTarget
    const valor = {
      nome_empresa: (form.elements.namedItem('nome_empresa') as HTMLInputElement).value,
      cnpj: (form.elements.namedItem('cnpj') as HTMLInputElement).value,
      telefone: (form.elements.namedItem('telefone') as HTMLInputElement).value,
      endereco: (form.elements.namedItem('endereco') as HTMLInputElement).value,
      cidade: (form.elements.namedItem('cidade') as HTMLInputElement).value,
      estado: (form.elements.namedItem('estado') as HTMLInputElement).value,
      site: (form.elements.namedItem('site') as HTMLInputElement).value,
      moeda: (form.elements.namedItem('moeda') as HTMLSelectElement).value,
      timezone: (form.elements.namedItem('timezone') as HTMLSelectElement).value,
    }

    const res = await fetch('/api/configuracoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valor),
    })
    const json = await res.json()

    if (json.error) {
      setErro(json.error)
      setStatus('erro')
    } else {
      setStatus('ok')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
      {status === 'ok' && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Configurações salvas com sucesso!
        </div>
      )}
      {status === 'erro' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
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

      <div className="pt-2">
        <button type="submit" disabled={status === 'saving'}
          className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">
          {status === 'saving' ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </form>
  )
}
