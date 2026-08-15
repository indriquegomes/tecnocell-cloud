import { IconUsers } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { ImportarPessoas } from './ImportarPessoas'

export default function ImportarClientesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconUsers className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Importar / Exportar Clientes</h2>
          <Dica texto="Baixa os clientes e fornecedores em planilha, edita no Excel e reenvia. Mostra o que vai mudar antes de gravar." />
        </div>
        <a href="/painel/clientes/importar/exportar"
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">
          Baixar planilha atual
        </a>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">Como funciona:</p>
        <p>1. Clique em <b>Baixar planilha atual</b> pra pegar todos os clientes/fornecedores de hoje.</p>
        <p>2. Edite no Excel. <b>Não mexa na coluna ID</b> — ela é o que liga cada linha ao cadastro certo.</p>
        <p>3. Pra cadastrar alguém novo, adicione uma linha e deixe o ID em branco.</p>
        <p>4. Envie aqui. A tela confere e mostra o que muda — <b>sem gravar nada ainda</b>. Confirme pra gravar.</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <ImportarPessoas />
      </div>
    </div>
  )
}
