import Link from 'next/link'
import { createServiceClient, requirePermissao } from '@/lib/supabase/server'

export async function PessoaAplicativo({ pessoaId }: { pessoaId: string }) {
  await requirePermissao('clientes')
  const service = await createServiceClient()
  const { data, error } = await service.from('cadastros_clientes').select('user_id,email,status').eq('pessoa_id', pessoaId)
  return <section id="aplicativo" className="scroll-mt-20 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h3 className="text-lg font-semibold text-gray-900">Aplicativo</h3>
    <p className="mt-1 text-sm text-gray-600">Conta do cliente vinculada a esta pessoa. Separada do acesso de funcionários ao Cloud.</p>
    {error ? <p role="alert" className="mt-4 text-sm text-red-700">Não foi possível consultar a conta do aplicativo. Recarregue a página para tentar novamente.</p> : data?.length ? data.map(c => <div key={c.user_id} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
      <div><p className="break-all font-medium text-gray-800">{c.email || 'Conta sem e-mail'}</p><p className="text-sm text-gray-600">{c.status === 'aprovado' ? 'Aprovado' : c.status === 'bloqueado' ? 'Bloqueado' : 'Em análise'}</p></div>
      <Link href={`/painel/clientes-app?conta=${encodeURIComponent(c.user_id)}`} className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-blue-700">Gerenciar acesso</Link>
    </div>) : <div className="mt-4"><p className="text-sm text-gray-600">Nenhuma conta vinculada.</p><Link href="/painel/clientes-app" className="inline-block min-h-11 py-2 text-sm font-semibold text-blue-700">Ver solicitações de acesso</Link></div>}
  </section>
}
