'use client'

import { CampoDinheiro } from '@/components/CampoDinheiro'

// Preços por tabela — substituiu o antigo "preço padrão" único.
// São 3 valores de venda (ATACADO1, ATACADO2, VAREJO) + custo + mínimo.
// CUSTO não se digita aqui: o trigger trg_sincronizar_item_tabela_custo copia
// preco_custo pra tabela CUSTO sozinho a cada insert/update.
export function PrecoFields({
  custoInicial = 0,
  atacado1Inicial = 0,
  atacado2Inicial = 0,
  varejoInicial = 0,
  minimoInicial = 0,
  podeCusto = true,
}: {
  custoInicial?: number
  atacado1Inicial?: number
  atacado2Inicial?: number
  varejoInicial?: number
  minimoInicial?: number
  podeCusto?: boolean
}) {
  return (
    <div className="sm:col-span-2 grid gap-5 sm:grid-cols-2">
      {podeCusto && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço de Custo (R$)</label>
          <CampoDinheiro name="preco_custo" defaultValue={custoInicial} />
          <p className="mt-1 text-[11px] text-gray-400">Vira a tabela CUSTO automaticamente.</p>
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Atacado 1 (R$)</label>
        <CampoDinheiro name="preco_atacado1" defaultValue={atacado1Inicial} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Atacado 2 (R$)</label>
        <CampoDinheiro name="preco_atacado2" defaultValue={atacado2Inicial} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Varejo (R$)</label>
        <CampoDinheiro name="preco_varejo" defaultValue={varejoInicial} />
      </div>
      {podeCusto && (
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço Mínimo (R$)</label>
          <CampoDinheiro name="preco_minimo" defaultValue={minimoInicial} />
          <p className="mt-1 text-[11px] text-gray-400">Piso de venda. Só quem tem a permissão &quot;Vender abaixo do mínimo&quot; fecha venda abaixo disso.</p>
        </div>
      )}
    </div>
  )
}
