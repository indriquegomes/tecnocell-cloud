import { notFound } from 'next/navigation'
import { IconStore } from '@/components/icons'
import { buscarConexao } from '@/lib/mercado-livre'
import { AbasLojaML } from './AbasLojaML'
import { ImportarAnunciosBotao } from '../../ImportarAnunciosBotao'
import { DesconectarBotao } from '../../DesconectarBotao'

// Um catálogo grande ainda pode levar mais que o padrão da Vercel mesmo
// buscando em lote — 60s é o máximo permitido no plano Hobby, então é o teto
// seguro que funciona em qualquer plano sem dar erro de configuração.
// (Precisa estar num page.tsx/layout.tsx, não em actions.ts — Server Actions
// herdam o maxDuration da página/layout que os chama.)
export const maxDuration = 60

export default async function LojaMercadoLivreLayout({
  children, params,
}: {
  children: React.ReactNode
  params: Promise<{ conexaoId: string }>
}) {
  const { conexaoId } = await params
  const conexao = await buscarConexao(conexaoId)
  if (!conexao) notFound()

  const nomeLoja = conexao.nome_loja ?? conexao.ml_nickname ?? conexao.ml_user_id
  const contaML = conexao.ml_nickname ?? conexao.ml_user_id

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">{nomeLoja}</h2>
          {conexao.nome_loja && (
            <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {contaML}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ImportarAnunciosBotao conexaoId={conexaoId} />
          <DesconectarBotao conexaoId={conexaoId} />
        </div>
      </div>
      <AbasLojaML conexaoId={conexaoId} />
      {children}
    </div>
  )
}
