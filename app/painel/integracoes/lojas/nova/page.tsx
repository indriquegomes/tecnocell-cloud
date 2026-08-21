import { IconStore } from '@/components/icons'

export default function NovaLojaMercadoLivrePage() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Mercado Livre</h2>
      </div>

      <form action="/api/integracoes/mercado-livre/autorizar" method="get"
        className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">Nome da Loja *</span>
          <input
            type="text" name="nome" required maxLength={60}
            placeholder="Ex: Petrópolis, Teresópolis..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-xs text-gray-400">
          Só pra identificar essa conexão na lista — não muda nada no Mercado Livre.
          O próximo passo pede login na conta do Mercado Livre dessa loja.
        </p>
        <button type="submit"
          className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
          Continuar e logar no Mercado Livre
        </button>
      </form>
    </div>
  )
}
