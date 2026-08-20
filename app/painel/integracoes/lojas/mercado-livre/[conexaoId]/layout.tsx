import { notFound } from 'next/navigation'
import { IconStore } from '@/components/icons'
import { buscarConexao } from '@/lib/mercado-livre'
import { AbasLojaML } from './AbasLojaML'

export default async function LojaMercadoLivreLayout({
  children, params,
}: {
  children: React.ReactNode
  params: Promise<{ conexaoId: string }>
}) {
  const { conexaoId } = await params
  const conexao = await buscarConexao(conexaoId)
  if (!conexao) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Mercado Livre</h2>
        <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          {conexao.ml_nickname ?? conexao.ml_user_id}
        </span>
      </div>
      <AbasLojaML conexaoId={conexaoId} />
      {children}
    </div>
  )
}
