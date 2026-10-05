'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { alterarStatusCadastro, buscarPessoasParaVinculo, abrirComprovacao } from './actions'

export type CadastroApp = {
  user_id: string; nome_completo: string | null; usuario: string | null; email: string | null
  cpf: string | null; rg: string | null; endereco: string | null; cep: string | null
  data_nascimento: string | null; comprovante_path: string | null; pessoa_id: string | null
  pessoa_nome: string | null; status: 'pendente' | 'aprovado' | 'bloqueado' | null; created_at: string | null
}
const nomes = { pendente: 'Em análise', aprovado: 'Aprovado', bloqueado: 'Bloqueado' }
const button = 'rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 min-h-11'
function Situacao({ status }: { status: CadastroApp['status'] }) {
  const s = status ?? 'pendente'
  return <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${s === 'aprovado' ? 'bg-green-100 text-green-800' : s === 'bloqueado' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{nomes[s]}</span>
}

export function ClientesAppClient({ cadastros, contaInicial, gerenciamentoHabilitado = false }: { cadastros: CadastroApp[]; contaInicial?: string; gerenciamentoHabilitado?: boolean }) {
  const [filtro, setFiltro] = useState('pendente')
  const [busca, setBusca] = useState('')
  const [id, setId] = useState(contaInicial ?? null)
  const cadastro = cadastros.find(c => c.user_id === id)
  const visiveis = cadastros.filter(c => (filtro === 'todos' || (c.status ?? 'pendente') === filtro) && `${c.nome_completo ?? ''} ${c.email ?? ''} ${c.usuario ?? ''}`.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR')))
  if (cadastro) return <Analise key={cadastro.user_id} cadastro={cadastro} voltar={() => setId(null)} gerenciamentoHabilitado={gerenciamentoHabilitado} />
  return <div className="space-y-4">
    {id && <p role="status" className="text-sm text-amber-800">A conta solicitada não foi encontrada. Escolha uma conta na lista.</p>}
    <div className="flex flex-wrap gap-2">{(['pendente', 'aprovado', 'bloqueado', 'todos'] as const).map(s => <button key={s} aria-pressed={filtro === s} onClick={() => setFiltro(s)} className={`${button} ${filtro === s ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{s === 'todos' ? 'Todas as contas' : s === 'pendente' ? `Solicitações (${cadastros.filter(c => !c.status || c.status === 'pendente').length})` : s === 'aprovado' ? 'Aprovados' : 'Bloqueados'}</button>)}</div>
    <input type="search" aria-label="Buscar solicitação" className="field bg-white" placeholder="Buscar por nome, usuário ou e-mail" value={busca} onChange={e => setBusca(e.target.value)} />
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="hidden grid-cols-[2fr_1fr_1fr_100px] gap-3 bg-gray-50 px-5 py-3 text-xs font-semibold text-gray-600 md:grid"><span>Solicitante</span><span>Pessoa no Cloud</span><span>Situação</span><span>Ação</span></div>
      {visiveis.length ? visiveis.map(c => <div key={c.user_id} className="grid gap-3 border-t border-gray-100 p-5 md:grid-cols-[2fr_1fr_1fr_100px] md:items-center">
        <div className="min-w-0"><p className="font-semibold text-gray-900">{c.nome_completo || 'Nome não informado'}</p><p className="break-all text-sm text-gray-600">{c.email || c.usuario || 'Sem e-mail'}</p></div>
        <div className="text-sm text-gray-600">{c.pessoa_nome || 'Não vinculada'}</div><div><Situacao status={c.status} /></div>
        <button onClick={() => setId(c.user_id)} className="min-h-11 text-left text-sm font-semibold text-blue-700">{!c.status || c.status === 'pendente' ? 'Analisar' : 'Ver conta'}</button>
      </div>) : <p className="p-10 text-center text-sm text-gray-600">Nenhum cadastro encontrado neste filtro.</p>}
    </div>
  </div>
}

function Analise({ cadastro: c, voltar, gerenciamentoHabilitado }: { cadastro: CadastroApp; voltar: () => void; gerenciamentoHabilitado: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busca, setBusca] = useState('')
  const [pessoa, setPessoa] = useState<{ id: string; nome: string } | null>(c.pessoa_id ? { id: c.pessoa_id, nome: c.pessoa_nome || 'Pessoa vinculada' } : null)
  const [opcoes, setOpcoes] = useState<{ id: string; nome: string; cpf_cnpj: string | null }[]>([])
  const [mensagem, setMensagem] = useState('')
  const [foto, setFoto] = useState<string | null>(null)
  async function token() { const { data } = await createClient().auth.getSession(); return data.session?.access_token ?? '' }
  function salvar(status: 'pendente' | 'aprovado' | 'bloqueado') {
    start(async () => { setMensagem(''); try { const r = await alterarStatusCadastro(c.user_id, status, pessoa?.id ?? null, await token()); setMensagem(r.message); if (r.ok) router.refresh() } catch { setMensagem('Não foi possível salvar. Sua seleção foi mantida; tente novamente.') } })
  }
  const fields = [['CPF', c.cpf], ['RG', c.rg], ['Nascimento', c.data_nascimento], ['CEP', c.cep], ['Endereço', c.endereco], ['Solicitado em', c.created_at ? new Date(c.created_at).toLocaleString('pt-BR') : null]]
  return <div className="space-y-5">
    <button onClick={voltar} className="min-h-11 text-sm font-semibold text-blue-700">Voltar às solicitações</button>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold text-gray-900">{c.nome_completo || 'Nome não informado'}</h3><p className="break-all text-sm text-gray-600">{c.email || 'Sem e-mail'}</p></div><Situacao status={c.status} /></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white p-5"><h4 className="font-semibold text-gray-900">Dados enviados pelo aplicativo</h4><dl className="mt-4 grid gap-4 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="break-words text-sm font-medium text-gray-800">{value || '—'}</dd></div>)}</dl>
        <div className="mt-5 border-t border-gray-100 pt-4"><h4 className="font-semibold text-gray-900">Comprovação profissional</h4>{c.comprovante_path ? <button disabled={pending} className={`${button} mt-3`} onClick={() => start(async () => { try { setFoto(await abrirComprovacao(c.user_id, await token())) } catch { setMensagem('Não foi possível abrir a comprovação. Tente novamente.') } })}>Ver comprovação</button> : <p className="mt-2 text-sm text-gray-600">Nenhum arquivo enviado.</p>}{foto && <a href={foto} target="_blank" rel="noreferrer"><img src={foto} alt="Comprovação profissional enviada pelo solicitante" className="mt-3 max-h-72 rounded-lg object-contain" /></a>}</div>
      </section>
      <section className="rounded-xl border border-gray-200 bg-white p-5"><h4 className="font-semibold text-gray-900">Pessoa no Cloud</h4><p className="mt-1 text-sm text-gray-600">Confira a identidade e escolha o cadastro correspondente.</p>
        {pessoa && <div className="mt-4 rounded-lg bg-blue-50 p-3"><p className="font-semibold text-blue-900">{pessoa.nome}</p><Link href={`/painel/clientes/${encodeURIComponent(pessoa.id)}/editar#aplicativo`} className="inline-block min-h-11 py-2 text-sm font-semibold text-blue-700">Abrir ficha da pessoa</Link></div>}
        {c.status !== 'aprovado' && <><div className="mt-4 flex gap-2"><input className="field min-w-0" aria-label="Buscar pessoa no Cloud" placeholder="Nome ou CPF/CNPJ" value={busca} onChange={e => setBusca(e.target.value)} /><button className={button} disabled={pending || busca.trim().length < 3} onClick={() => start(async () => { setMensagem(''); setOpcoes([]); try { const r = await buscarPessoasParaVinculo(busca, await token()); setOpcoes(r); if (!r.length) setMensagem('Nenhuma pessoa encontrada. Confira os dados ou cadastre a pessoa no Cloud.') } catch { setMensagem('Não foi possível buscar pessoas. Tente novamente.') } })}>Buscar</button></div>
        {opcoes.map(p => <button key={p.id} disabled={pending} className="mt-2 block min-h-11 w-full rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50" onClick={() => { setPessoa(p); setOpcoes([]) }}>{p.nome}<span className="block text-xs text-gray-600">{p.cpf_cnpj || 'Sem documento'}</span></button>)}</>}
        <p className="mt-5 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">A aprovação permite solicitar compras pelo aplicativo. Não concede acesso de funcionário ao Cloud nem altera crédito, pagamentos ou estoque.</p>
        <>{!gerenciamentoHabilitado && <p role="status" className="mt-4 text-sm text-amber-800">Consulta disponível. Aprovações e bloqueios serão liberados após a validação da integração.</p>}</><div className="mt-4 flex flex-wrap gap-2">{c.status !== 'aprovado' && <button className={`${button} border-blue-600 bg-blue-600 text-white`} disabled={pending || !pessoa || !gerenciamentoHabilitado} onClick={() => salvar('aprovado')}>Vincular e aprovar acesso</button>}{c.status !== 'pendente' && <button className={button} disabled={pending || !gerenciamentoHabilitado} onClick={() => salvar('pendente')}>Voltar para análise</button>}{c.status !== 'bloqueado' && <button className={`${button} text-red-700`} disabled={pending || !gerenciamentoHabilitado} onClick={() => salvar('bloqueado')}>Bloquear acesso</button>}</div>
        {pending && <p role="status" className="mt-3 text-sm text-gray-600">Processando…</p>}{mensagem && <p role="status" className="mt-3 text-sm text-gray-800">{mensagem}</p>}
      </section>
    </div>
  </div>
}
