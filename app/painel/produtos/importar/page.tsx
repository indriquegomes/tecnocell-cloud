import { IconPackage } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { ImportarProdutos } from './ImportarProdutos'

export default function ImportarProdutosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Importar Itens</h2>
        <Dica texto="Sobe a planilha de produtos exportada do SIGE. Mostra o que vai mudar antes de gravar; so grava depois que voce confirma." />
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">Como funciona:</p>
        <p>1. No SIGE, exporte a tabela de produtos em .xlsx.</p>
        <p>2. Envie aqui. A tela confere e mostra o que e novo e o que vai mudar — <b>sem gravar nada ainda</b>.</p>
        <p>3. Confira e clique em confirmar pra gravar.</p>
        <p className="pt-1">
          A exportacao do SIGE vem <b>paginada</b> (varios arquivos). Pode enviar um de cada vez,
          em qualquer ordem: cada arquivo so mexe nos produtos que ele traz. Produto que nao esta
          no arquivo fica como esta — nada e apagado.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <ImportarProdutos />
      </div>
    </div>
  )
}
