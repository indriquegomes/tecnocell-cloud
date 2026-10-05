import { requirePermissao, createServiceClient } from '@/lib/supabase/server'
import { ClientesAppClient, type CadastroApp } from './ClientesAppClient'

export default async function ClientesAppPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  await requirePermissao('clientes')
  const { conta } = await searchParams
  const service = await createServiceClient()
  const data: Omit<CadastroApp, 'pessoa_nome'>[] = []
  let falha = false
  for (let inicio = 0; ; inicio += 500) {
    const result = await service.from('cadastros_clientes')
      .select('user_id,nome_completo,usuario,email,rg,cpf,endereco,cep,data_nascimento,comprovante_path,pessoa_id,status,created_at')
      .order('created_at', { ascending: false }).order('user_id').range(inicio, inicio + 499)
    if (result.error) { falha = true; break }
    data.push(...(result.data ?? []))
    if ((result.data ?? []).length < 500) break
  }
  const ids = [...new Set((data ?? []).map(c => c.pessoa_id).filter(Boolean))]
  const pessoas = ids.length ? await service.from('pessoas').select('id,nome').in('id', ids) : { data: [], error: null }
  const nomes = new Map((pessoas.data ?? []).map(p => [p.id, p.nome]))
  const cadastros = (data ?? []).map(c => ({ ...c, pessoa_nome: c.pessoa_id ? nomes.get(c.pessoa_id) ?? null : null })) as CadastroApp[]
  return <div className="space-y-6">
    <div><h2 className="text-2xl font-bold text-gray-900">Cadastros do aplicativo</h2><p className="text-sm text-gray-500">Confira as solicitações e vincule cada conta à pessoa cadastrada no Cloud.</p></div>
    {falha || pessoas.error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Não foi possível carregar os cadastros. Recarregue a página para tentar novamente.</div> : <ClientesAppClient cadastros={cadastros} contaInicial={conta} />}
  </div>
}
