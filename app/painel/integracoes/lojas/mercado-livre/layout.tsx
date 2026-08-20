import { IconStore } from '@/components/icons'
import { conexaoAtual } from '@/lib/mercado-livre'
import { AbasLojaML } from './AbasLojaML'

export default async function LojaMercadoLivreLayout({ children }: { children: React.ReactNode }) {
  const conexao = await conexaoAtual()

  if (!conexao) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Mercado Livre</h2>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">
            Loja não conectada. Conecte em{' '}
            <a href="/painel/integracoes/lojas" className="text-blue-600 hover:underline">Minhas Lojas</a>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Mercado Livre</h2>
        <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          {conexao.ml_nickname ?? conexao.ml_user_id}
        </span>
      </div>
      <AbasLojaML />
      {children}
    </div>
  )
}
