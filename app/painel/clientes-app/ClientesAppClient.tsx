'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { alterarStatusCadastro, buscarPessoasParaVinculo, type CadastroAppResult } from './actions'

export type CadastroApp = {
  user_id: string
  nome_completo: string | null
  usuario: string | null
  email: string | null
  rg: string | null
  cpf: string | null
  endereco: string | null
  cep: string | null
  data_nascimento: string | null
  comprovante_url: string | null
  pessoa_id: string | null
  pessoa_nome: string | null
  status: 'pendente' | 'aprovado' | 'bloqueado' | null
  created_at: string | null
}

const supabase = createClient()

function CadastroCard({ cadastro }: { cadastro: CadastroApp }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<CadastroAppResult | null>(null)
  const [busca, setBusca] = useState('')
  const [opcoes, setOpcoes] = useState<{ id: string; nome: string; cpf_cnpj: string | null }[]>([])
  const [pessoaId, setPessoaId] = useState(cadastro.pessoa_id)
  const [pessoaNome, setPessoaNome] = useState(cadastro.pessoa_nome)
  const status = cadastro.status ?? 'pendente'

  const alterar = (novoStatus: 'pendente' | 'aprovado' | 'bloqueado') => startTransition(async () => {
    setResultado(null)
    const { data } = await supabase.auth.getSession()
    const resposta = await alterarStatusCadastro(cadastro.user_id, novoStatus, pessoaId, data.session?.access_token ?? '')
    setResultado(resposta)
    if (resposta.ok) router.refresh()
  })

  const procurar = () => startTransition(async () => {
    setResultado(null)
    try {
      const { data } = await supabase.auth.getSession()
      setOpcoes(await buscarPessoasParaVinculo(busca, data.session?.access_token ?? ''))
    } catch { setResultado({ ok: false, message: 'Não foi possível buscar pessoas.' }) }
  })

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">{cadastro.nome_completo || 'Nome não informado'}</h3>
          <p className="text-sm text-gray-500">@{cadastro.usuario || 'sem-usuario'} · {cadastro.email || 'sem e-mail'}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status === 'aprovado' ? 'bg-green-100 text-green-700' : status === 'bloqueado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
          {status === 'aprovado' ? 'Aprovado' : status === 'bloqueado' ? 'Bloqueado' : 'Em análise'}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 p-3 text-sm">
        <p className="font-medium text-gray-700">Pessoa do SaaS: {pessoaNome || 'não vinculada'}</p>
        {status !== 'aprovado' && <>
          <div className="mt-2 flex gap-2">
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou CPF/CNPJ (3+ caracteres)" aria-label="Buscar pessoa cadastrada" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2" />
            <button type="button" disabled={pending || busca.trim().length < 3} onClick={procurar} className="rounded-lg border border-gray-300 px-3 py-2 disabled:opacity-50">Buscar</button>
          </div>
          {opcoes.map(pessoa => <button type="button" key={pessoa.id} onClick={() => { setPessoaId(pessoa.id); setPessoaNome(pessoa.nome); setOpcoes([]) }} className="mt-2 block w-full rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50">{pessoa.nome} · {pessoa.cpf_cnpj || 'sem documento'}</button>)}
        </>}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px]">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-400">CPF</dt><dd className="font-medium text-gray-700">{cadastro.cpf || '—'}</dd></div>
          <div><dt className="text-gray-400">RG</dt><dd className="font-medium text-gray-700">{cadastro.rg || '—'}</dd></div>
          <div><dt className="text-gray-400">Nascimento</dt><dd className="font-medium text-gray-700">{cadastro.data_nascimento ? new Date(cadastro.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</dd></div>
          <div><dt className="text-gray-400">CEP</dt><dd className="font-medium text-gray-700">{cadastro.cep || '—'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-gray-400">Endereço</dt><dd className="font-medium text-gray-700">{cadastro.endereco || '—'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-gray-400">Solicitado em</dt><dd className="font-medium text-gray-700">{cadastro.created_at ? new Date(cadastro.created_at).toLocaleString('pt-BR') : '—'}</dd></div>
        </dl>
        <div>
          <p className="mb-1 text-xs font-medium text-gray-400">Comprovação profissional</p>
          {cadastro.comprovante_url ? <a href={cadastro.comprovante_url} target="_blank" rel="noreferrer"><img src={cadastro.comprovante_url} alt={`Comprovação de ${cadastro.nome_completo || 'cliente'}`} className="h-36 w-full rounded-xl border border-gray-200 object-cover" /></a> : <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-gray-300 text-xs text-gray-400">Sem foto</div>}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
        {status !== 'aprovado' && <button disabled={pending || !pessoaId} onClick={() => alterar('aprovado')} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">Vincular e aprovar</button>}
        {status !== 'pendente' && <button disabled={pending} onClick={() => alterar('pendente')} className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">Voltar para análise</button>}
        {status !== 'bloqueado' && <button disabled={pending} onClick={() => alterar('bloqueado')} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Bloquear</button>}
        {pending && <span className="text-sm text-gray-400">Salvando…</span>}
        {resultado && <span className={`text-sm font-medium ${resultado.ok ? 'text-green-600' : 'text-red-600'}`}>{resultado.message}</span>}
      </div>
    </article>
  )
}

export function ClientesAppClient({ cadastros }: { cadastros: CadastroApp[] }) {
  const [filtro, setFiltro] = useState<'todos' | 'pendente' | 'aprovado' | 'bloqueado'>('pendente')
  const visiveis = filtro === 'todos' ? cadastros : cadastros.filter((c) => (c.status ?? 'pendente') === filtro)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(['pendente', 'aprovado', 'bloqueado', 'todos'] as const).map((valor) => <button key={valor} onClick={() => setFiltro(valor)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${filtro === valor ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>{valor === 'pendente' ? 'Em análise' : valor === 'aprovado' ? 'Aprovados' : valor === 'bloqueado' ? 'Bloqueados' : 'Todos'}</button>)}
      </div>
      {visiveis.length ? visiveis.map((cadastro) => <CadastroCard key={cadastro.user_id} cadastro={cadastro} />) : <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">Nenhum cadastro neste filtro.</div>}
    </div>
  )
}
