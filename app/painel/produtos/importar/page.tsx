import { IconPackage } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { ImportarProdutos } from './ImportarProdutos'

export default function ImportarProdutosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Importar Itens</h2>
        <Dica texto="Sobe a planilha de itens exportada do SIGE. Nesta etapa nada e gravado: serve so pra ver o formato do arquivo." />
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">Esta tela ainda nao importa nada.</p>
        <p>
          Ela le a planilha e mostra as colunas e as primeiras linhas, para descobrirmos o
          formato exato da exportacao do SIGE. <b>Pode subir a vontade — nada e alterado no
          sistema.</b>
        </p>
        <p>Depois que virmos as colunas de verdade, o botao de aplicar e liberado.</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <ImportarProdutos />
      </div>
    </div>
  )
}
