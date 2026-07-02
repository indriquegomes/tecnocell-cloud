'use client'

import { useState } from 'react'
import Link from 'next/link'
import { criarLoja, editarLoja } from './actions'

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

export type LojaEdit = {
  id: string; nome: string; razao_social: string | null; cnpj: string | null; inscricao_estadual: string | null
  telefone: string | null; cep: string | null; endereco: string | null; numero: string | null
  bairro: string | null; cidade: string | null; uf: string | null; ativa: boolean
}

export function LojaForm({ editando }: { editando?: LojaEdit }) {
  const action = editando ? editarLoja.bind(null, editando.id) : criarLoja

  const [cep, setCep] = useState(editando?.cep ?? '')
  const [endereco, setEndereco] = useState(editando?.endereco ?? '')
  const [bairro, setBairro] = useState(editando?.bairro ?? '')
  const [cidade, setCidade] = useState(editando?.cidade ?? '')
  const [uf, setUf] = useState(editando?.uf ?? '')
  const [buscando, setBuscando] = useState(false)

  async function buscarCep() {
    const num = cep.replace(/\D/g, '')
    if (num.length !== 8) return
    setBuscando(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${num}/json/`)
      const d = await r.json()
      if (!d.erro) {
        setEndereco(d.logradouro || '')
        setBairro(d.bairro || '')
        setCidade(d.localidade || '')
        setUf(d.uf || '')
      }
    } catch { /* silencioso */ }
    setBuscando(false)
  }

  return (
    <form action={action} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
      {/* Identificação */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Identificação</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome da loja *</label>
            <input name="nome" required defaultValue={editando?.nome ?? ''} className="field" placeholder="TecnoCell Teresópolis" />
            <p className="mt-1 text-[11px] text-gray-400">Nome curto que aparece no sistema e no cupom</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Razão Social</label>
            <input name="razao_social" defaultValue={editando?.razao_social ?? ''} className="field" placeholder="TecnoCell Comércio de Celulares LTDA" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">CNPJ</label>
            <input name="cnpj" defaultValue={editando?.cnpj ?? ''} className="field" placeholder="00.000.000/0001-00" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Inscrição Estadual</label>
            <input name="inscricao_estadual" defaultValue={editando?.inscricao_estadual ?? ''} className="field" placeholder="Isento ou nº" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Telefone</label>
            <input name="telefone" defaultValue={editando?.telefone ?? ''} className="field" placeholder="(21) 99999-9999" />
          </div>
        </div>
      </div>

      {/* Endereço */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Endereço</h3>
        <div className="grid gap-5 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">CEP</label>
            <div className="relative">
              <input name="cep" value={cep} onChange={(e) => setCep(e.target.value)} onBlur={buscarCep} className="field" placeholder="00000-000" />
              {buscando && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">buscando…</span>}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Preenche o endereço sozinho</p>
          </div>
          <div className="sm:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Endereço</label>
            <input name="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} className="field" placeholder="Rua / Avenida" />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Número</label>
            <input name="numero" defaultValue={editando?.numero ?? ''} className="field" placeholder="123" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Bairro</label>
            <input name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} className="field" />
          </div>
          <div className="sm:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cidade</label>
            <input name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} className="field" />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">UF</label>
            <select name="uf" value={uf} onChange={(e) => setUf(e.target.value)} className="field">
              <option value="">—</option>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
      </div>

      {editando && (
        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" name="ativa" value="true" defaultChecked={editando.ativa} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          Loja ativa
        </label>
      )}

      <div className="flex gap-3 pt-1">
        <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
          {editando ? 'Salvar Alterações' : 'Salvar'}
        </button>
        <Link href="/painel/lojas" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
