import { headers } from 'next/headers'
import { PainelShell } from '@/components/PainelShell'

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  // O proxy já verificou a autenticação e redireciona para /login se necessário.
  // Aqui só lemos o email que o proxy passou via header.
  const headersList = await headers()
  const email = headersList.get('x-user-email') ?? ''

  return <PainelShell email={email}>{children}</PainelShell>
}
