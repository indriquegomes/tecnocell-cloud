import { IconStore } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { listarConexoes } from '@/lib/mercado-livre'
import { SeletorLoja } from './SeletorLoja'
import { AdicionarLojaDropdown } from './AdicionarLojaDropdown'

export default async function MinhasLojasLayout({ children }: { children: React.ReactNode }) {
  const conexoes = await listarConexoes()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Minhas Lojas</h2>
          <Dica texto="Visualize as informações de anúncios das suas lojas, vendas e mais." />
        </div>
        <div className="flex items-center gap-3">
          <SeletorLoja conexoes={conexoes} />
          <AdicionarLojaDropdown />
        </div>
      </div>
      {children}
    </div>
  )
}
