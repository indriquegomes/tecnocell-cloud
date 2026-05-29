import { headers } from 'next/headers'
import { Sidebar } from '@/components/Sidebar'
import { SessionGuard } from '@/components/SessionGuard'

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  // O proxy já verificou a autenticação e redireciona para /login se necessário.
  // Aqui só lemos o email que o proxy passou via header.
  const headersList = await headers()
  const email = headersList.get('x-user-email') ?? ''

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <SessionGuard />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <h1 className="text-sm font-medium text-gray-500">Painel Interno</h1>
          <span className="text-sm text-gray-500">{email}</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
