import { ChatWidget } from '@/components/ChatWidget'

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Chat com IA</h2>
        <p className="mt-1 text-sm text-gray-500">
          Assistente com acesso aos dados do sistema: estoque, financeiro, clientes e produtos.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-3xl">
            🤖
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-800">Assistente TecnoCell Cloud</h3>
          <p className="mb-6 max-w-md text-sm text-gray-500">
            Faça perguntas sobre o estoque, financeiro, desempenho de vendas ou qualquer dado do sistema.
            O chat abre no canto inferior direito da tela.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 text-left w-full max-w-lg">
            {[
              'Quantos produtos estão com estoque baixo?',
              'Qual o total a receber este mês?',
              'Quais são os produtos mais caros?',
              'Resuma a situação financeira atual.',
            ].map((sugestao) => (
              <div
                key={sugestao}
                className="rounded-lg border border-gray-200 p-3 text-sm text-gray-600 bg-gray-50"
              >
                💬 &quot;{sugestao}&quot;
              </div>
            ))}
          </div>
        </div>
      </div>

      <ChatWidget tipo="funcionario" />
    </div>
  )
}
