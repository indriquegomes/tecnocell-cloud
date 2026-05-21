import { criarEmpresa } from '../actions'
import Link from 'next/link'

const ESTADOS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

export default async function NovaEmpresaPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/empresas" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Nova Empresa</h2>
      </div>
      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
      <form action={criarEmpresa} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome / Razão Social *</label>
            <input name="nome" required className="field" placeholder="TecnoCell Ltda." />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">CNPJ</label>
            <input name="cnpj" className="field" placeholder="00.000.000/0001-00" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Telefone</label>
            <input name="telefone" className="field" placeholder="(24) 99999-9999" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">E-mail</label>
            <input name="email" type="email" className="field" placeholder="contato@empresa.com.br" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Endereço</label>
            <input name="endereco" className="field" placeholder="Rua, número, bairro" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cidade</label>
            <input name="cidade" className="field" placeholder="Petrópolis" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Estado</label>
            <select name="estado" className="field">
              <option value="">—</option>
              {ESTADOS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Salvar
          </button>
          <Link href="/painel/empresas" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
