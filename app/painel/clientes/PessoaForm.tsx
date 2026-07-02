'use client'

import { useState } from 'react'
import Link from 'next/link'
import { criarPessoa, editarPessoa } from './actions'

const ESTADOS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const TIPOS: [string, string][] = [
  ['cliente', 'Cliente'], ['fornecedor', 'Fornecedor'], ['ambos', 'Cliente e Fornecedor'],
  ['tecnico', 'Técnico'], ['transportadora', 'Transportadora'], ['vendedor', 'Vendedor'],
]
const ORIGENS = ['Indicação', 'Instagram', 'Facebook', 'Google', 'Passou na loja', 'Cliente antigo', 'Outro']

type Tabela = { id: string; nome: string }
type Vendedor = { id: string; nome: string }
export type PessoaEdit = {
  id: string; nome: string; nome_fantasia: string | null; tipo: string; pessoa_fisica: boolean
  cpf_cnpj: string | null; rg: string | null; data_nascimento: string | null; email: string | null
  telefone: string | null; celular: string | null; cep: string | null; endereco: string | null
  numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null
  estado: string | null; tabela_preco_id: string | null; limite_credito: number | null
  vendedor_id: string | null; origem: string | null; observacoes: string | null
}

export function PessoaForm({ tabelas, vendedores, editando }: { tabelas: Tabela[]; vendedores: Vendedor[]; editando?: PessoaEdit }) {
  const action = editando ? editarPessoa.bind(null, editando.id) : criarPessoa

  // Endereço é controlado p/ a busca de CEP conseguir preencher
  const [cep, setCep] = useState(editando?.cep ?? '')
  const [endereco, setEndereco] = useState(editando?.endereco ?? '')
  const [bairro, setBairro] = useState(editando?.bairro ?? '')
  const [cidade, setCidade] = useState(editando?.cidade ?? '')
  const [estado, setEstado] = useState(editando?.estado ?? '')
  const [buscandoCep, setBuscandoCep] = useState(false)

  async function buscarCep() {
    const num = cep.replace(/\D/g, '')
    if (num.length !== 8) return
    setBuscandoCep(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${num}/json/`)
      const d = await r.json()
      if (!d.erro) {
        setEndereco(d.logradouro || '')
        setBairro(d.bairro || '')
        setCidade(d.localidade || '')
        setEstado(d.uf || '')
      }
    } catch { /* silencioso — preenche na mão */ }
    setBuscandoCep(false)
  }

  return (
    <form action={action} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
      {/* Identificação */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Identificação</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome / Razão Social *</label>
            <input name="nome" required defaultValue={editando?.nome ?? ''} className="field" placeholder="Nome completo ou razão social" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome fantasia (PJ)</label>
            <input name="nome_fantasia" defaultValue={editando?.nome_fantasia ?? ''} className="field" placeholder="Como a empresa é conhecida" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Rótulo (tipo) *</label>
            <select name="tipo" defaultValue={editando?.tipo ?? 'cliente'} className="field">
              {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Pessoa</label>
            <select name="pessoa_fisica" defaultValue={String(editando?.pessoa_fisica ?? true)} className="field">
              <option value="true">Física</option>
              <option value="false">Jurídica</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">CPF / CNPJ</label>
            <input name="cpf_cnpj" defaultValue={editando?.cpf_cnpj ?? ''} className="field" placeholder="000.000.000-00" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">RG</label>
            <input name="rg" defaultValue={editando?.rg ?? ''} className="field" placeholder="00.000.000-0" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Data de nascimento</label>
            <input name="data_nascimento" type="date" defaultValue={editando?.data_nascimento ?? ''} className="field" />
          </div>
        </div>
      </div>

      {/* Contato */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Contato</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Telefone fixo</label>
            <input name="telefone" defaultValue={editando?.telefone ?? ''} className="field" placeholder="(24) 3333-3333" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Celular / WhatsApp</label>
            <input name="celular" defaultValue={editando?.celular ?? ''} className="field" placeholder="(24) 99999-9999" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">E-mail</label>
            <input name="email" type="email" defaultValue={editando?.email ?? ''} className="field" placeholder="email@exemplo.com" />
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
              <input name="cep" value={cep} onChange={(e) => setCep(e.target.value)} onBlur={buscarCep}
                className="field" placeholder="00000-000" />
              {buscandoCep && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">buscando…</span>}
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
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Complemento</label>
            <input name="complemento" defaultValue={editando?.complemento ?? ''} className="field" placeholder="Apto, sala, fundos…" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Bairro</label>
            <input name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} className="field" />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cidade</label>
            <input name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} className="field" />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Estado</label>
            <select name="estado" value={estado} onChange={(e) => setEstado(e.target.value)} className="field">
              <option value="">—</option>
              {ESTADOS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Comercial */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Comercial</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Tabela de preço padrão</label>
            <select name="tabela_preco_id" defaultValue={editando?.tabela_preco_id ?? ''} className="field">
              <option value="">Preço Padrão</option>
              {tabelas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">Aplicada sozinha no PDV ao escolher este cliente</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Limite de crédito (fiado) R$</label>
            <input name="limite_credito" type="number" step="0.01" min="0" defaultValue={String(editando?.limite_credito ?? 0)} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Vendedor responsável</label>
            <select name="vendedor_id" defaultValue={editando?.vendedor_id ?? ''} className="field">
              <option value="">—</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Origem (como conheceu)</label>
            <select name="origem" defaultValue={editando?.origem ?? ''} className="field">
              <option value="">—</option>
              {ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Observações */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
        <textarea name="observacoes" rows={3} defaultValue={editando?.observacoes ?? ''} className="field" placeholder="Anotações sobre o cliente…" />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
          {editando ? 'Salvar Alterações' : 'Salvar'}
        </button>
        <Link href="/painel/clientes" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
