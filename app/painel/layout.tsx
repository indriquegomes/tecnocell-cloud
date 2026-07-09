import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PainelShell } from '@/components/PainelShell'
import { createServiceClient, permissoesEfetivas, configAcesso } from '@/lib/supabase/server'
import { permissaoPorRota, temPermissao } from '@/lib/permissoes'
import { acessoBloqueado } from '@/lib/acesso'

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const h = await headers()
  const email    = h.get('x-user-email') ?? ''
  const userId   = h.get('x-user-id')   ?? ''
  const pathname = h.get('x-pathname')  ?? ''

  let nome        = email.split('@')[0]
  let permissoes: string[] = []
  let isMaster    = false
  let ativo       = true

  if (userId) {
    try {
      const supabase = await createServiceClient()
      const { data } = await supabase.from('perfis').select('nome').eq('id', userId).maybeSingle()
      if (data) nome = data.nome ?? nome
      // permissões efetivas (via cargo dinâmico, se houver)
      const ef = await permissoesEfetivas(userId)
      permissoes = ef.permissoes
      isMaster   = ef.isMaster
      ativo      = ef.ativo
    } catch {}
  }

  // Conta desativada → logout
  if (!ativo) redirect('/api/auth/signout')

  // Restrição de horário/dias — Master (dono) sempre entra.
  if (userId && !isMaster) {
    const motivo = acessoBloqueado(await configAcesso(userId))
    if (motivo) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
          <div className="text-5xl">🔒</div>
          <h1 className="text-xl font-bold text-gray-800">Fora do horário de acesso</h1>
          <p className="max-w-sm text-sm text-gray-500">{motivo}</p>
          {/* logout via form POST (nunca <Link>/GET: o Next prefetcha e desloga sozinho) */}
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="rounded-xl bg-gray-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 transition">
              Sair
            </button>
          </form>
        </div>
      )
    }
  }

  // Checa permissão para a rota atual
  const permNecessaria = permissaoPorRota(pathname)
  if (permNecessaria && !temPermissao(permissoes, permNecessaria, isMaster)) {
    redirect('/painel?acesso=negado')
  }

  return (
    <PainelShell
      email={email}
      nome={nome}
      permissoes={permissoes}
      isMaster={isMaster}
    >
      {children}
    </PainelShell>
  )
}
