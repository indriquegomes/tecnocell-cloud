import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PainelShell } from '@/components/PainelShell'
import { createServiceClient, permissoesEfetivas } from '@/lib/supabase/server'
import { permissaoPorRota, temPermissao } from '@/lib/permissoes'

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
