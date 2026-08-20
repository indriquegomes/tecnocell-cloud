'use client'

import { usePathname, useRouter } from 'next/navigation'

type Conexao = { id: string; ml_nickname: string | null; ml_user_id: string }

// Dropdown "Selecione uma Loja" no topo de Minhas Lojas — troca qual conexão
// está sendo exibida navegando pra rota daquela conexão (a página em si é
// server component e busca os dados de novo, então não precisa de estado
// compartilhado, só a URL).
export function SeletorLoja({ conexoes }: { conexoes: Conexao[] }) {
  const pathname = usePathname()
  const router = useRouter()

  if (conexoes.length === 0) return null

  const match = pathname.match(/\/mercado-livre\/([^/]+)/)
  const ativoId = match?.[1] ?? ''

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">Selecione uma Loja</span>
      <select
        value={ativoId}
        onChange={(e) => router.push(`/painel/integracoes/lojas/mercado-livre/${e.target.value}`)}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 font-medium text-gray-800"
      >
        {!ativoId && <option value="" disabled>Escolha uma loja</option>}
        {conexoes.map((c) => (
          <option key={c.id} value={c.id}>{c.ml_nickname ?? c.ml_user_id}</option>
        ))}
      </select>
    </label>
  )
}
