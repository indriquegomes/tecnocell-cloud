import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PainelShell } from '@/components/PainelShell'
import { createServiceClient } from '@/lib/supabase/server'
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
      const { data } = await supabase
        .from('perfis')
        .select('nome, permissoes, is_master, ativo')
        .eq('id', userId)
        .maybeSingle()

      if (data) {
        nome       = data.nome       ?? nome
        permissoes = data.permissoes ?? []
        isMaster   = data.is_master  ?? false
        ativo      = data.ativo      ?? true
      }
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
