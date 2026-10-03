import { IconUsers } from '@/components/icons'
import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { ClientesAppClient, type CadastroApp } from './ClientesAppClient'

type CadastroBanco = Omit<CadastroApp, 'comprovante_url'> & { comprovante_path: string | null }

export default async function ClientesAppPage() {
  await requirePermissao('clientes')
  const clientesApp = await createServiceClient()

  const { data, error } = await clientesApp.from('cadastros_clientes').select('user_id,nome_completo,usuario,email,rg,cpf,endereco,cep,data_nascimento,comprovante_path,pessoa_id,status,created_at').order('created_at', { ascending: false }).limit(100)
  if (error) return <div className="space-y-6"><Cabecalho /><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Não foi possível carregar os cadastros: {error.message}</div></div>

  const ids = [...new Set(((data ?? []) as CadastroBanco[]).map(c => c.pessoa_id).filter((id): id is string => !!id))]
  const { data: pessoas } = ids.length ? await clientesApp.from('pessoas').select('id,nome').in('id', ids) : { data: [] }
  const nomes = new Map((pessoas ?? []).map(p => [p.id, p.nome]))
  const cadastros = await Promise.all(((data ?? []) as CadastroBanco[]).map(async ({ comprovante_path, ...cadastro }) => {
    const signed = comprovante_path ? await clientesApp.storage.from('cadastros-clientes').createSignedUrl(comprovante_path, 60 * 10) : null
    return { ...cadastro, pessoa_nome: cadastro.pessoa_id ? nomes.get(cadastro.pessoa_id) ?? null : null, comprovante_url: signed?.data?.signedUrl ?? null }
  }))

  return <div className="space-y-6"><Cabecalho /><ClientesAppClient cadastros={cadastros} /></div>
}

function Cabecalho() {
  return <div className="flex items-center gap-2"><IconUsers className="h-6 w-6 text-[#1B6CA8]" /><div><h2 className="text-2xl font-bold text-gray-900">Cadastros do App</h2><p className="text-sm text-gray-500">Analise a comprovação antes de liberar compras.</p></div></div>
}
