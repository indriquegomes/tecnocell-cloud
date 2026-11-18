'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/Spinner'
import { SubmitButton } from '@/components/SubmitButton'
import { FornecedorSelect } from '../FornecedorSelect'
import { lerNotaFotos, criarNotaDosItens, type LeituraResultado } from '../actions'
import { formatBRL } from '@/lib/utils'
import { CLASSES_NOTA } from '@/lib/nota-classes'
import { EscolherProduto } from './EscolherProduto'
import { AjudaNota } from './AjudaNota'

type ItemLidoTela = {
  descricao: string
  quantidade: number
  preco: number | null
  produto_id: string | null
  produto_nome: string | null
  score: number
}

export function ImportarClient({
  fornecedores,
  depositos,
  lojas,
  proximoNumero,
  hoje,
  depositoPadrao,
}: {
  fornecedores: { id: string; nome: string }[]
  depositos: { id: string; nome: string; loja_id: string | null }[]
  lojas: { id: string; nome: string }[]
  proximoNumero: string
  hoje: string
  depositoPadrao: string | null
}) {
  const [leitura, formLer, lendo] = useActionState<LeituraResultado | null, FormData>(lerNotaFotos, null)
  const [itens, setItens] = useState<ItemLidoTela[] | null>(null)
  const [trocar, setTrocar] = useState<Record<number, boolean>>({})
  const [escolhidos, setEscolhidos] = useState<Record<number, string>>({})
  const [erroSubmit, setErroSubmit] = useState<string | null>(null)
  // De que a nota trata (frontal, bateria, acessório…). Filtra a busca de produto:
  // é o que impede casar a peça parecida e não a certa.
  const [classe, setClasse] = useState<string>('')

  // nova leitura substitui a lista — a pessoa pode reler com fotos melhores
  useEffect(() => {
    if (leitura?.ok) {
      setItens(leitura.itens as ItemLidoTela[])
      setTrocar({})
      setEscolhidos({})
      if (leitura.classe) setClasse(leitura.classe)
    }
  }, [leitura])

  const lojaNome = new Map(lojas.map((l) => [l.id, l.nome]))
  const lista = itens ?? []
  const total = lista.reduce((s, i) => s + i.quantidade * (i.preco ?? 0), 0)

  function removerLinha(i: number) {
    setItens((atual) => (atual ?? []).filter((_, idx) => idx !== i))
  }

  // blocos com produto vazio: a linha ficaria de fora da nota sem avisar
  function temLinhaSemProduto(atual: ItemLidoTela[]): boolean {
    return atual.some((it, i) => {
      const precisaEscolher = !it.produto_id || !!trocar[i]
      const escolhido = escolhidos[i] ?? it.produto_id ?? ''
      return precisaEscolher && !escolhido
    })
  }

  return (
    <div className="space-y-6">
      <AjudaNota />
      {/* 1. fotos */}
      <form action={formLer} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <p className="font-semibold text-gray-800">1. Anexe as fotos da nota (pode várias páginas)</p>
        <p className="text-sm text-gray-500">Uma nota com várias páginas vai junta — os itens das páginas são somados.</p>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">De que trata esta nota?</label>
          <select name="classe" value={classe} onChange={(e) => setClasse(e.target.value)} className="field">
            <option value="">— Não sei / misturada (procura no catálogo inteiro) —</option>
            {CLASSES_NOTA.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            Escolher a classe faz o app procurar só naquela família (ex.: frontais) em vez do catálogo inteiro —
            é o que evita casar a peça errada. Se você escrever no topo da nota (&quot;TELAS E FRONTAIS&quot;),
            o app também entende sozinho.
          </p>
        </div>
        <input
          type="file"
          name="fotos"
          multiple
          required
          accept="image/*"
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={lendo}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {lendo ? (
              <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Lendo fotos...</span>
            ) : (
              'Ler as fotos'
            )}
          </button>
          <Link href="/painel/compras/nova" className="text-sm text-gray-500 hover:text-gray-700">
            Prefere digitar a nota? Use a tela normal.
          </Link>
        </div>
      </form>

      {leitura && !leitura.ok && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{leitura.message}</div>
      )}

      {/* 2. conferir e criar */}
      {itens && (
        <form
          action={criarNotaDosItens}
          onSubmit={(e) => {
            if (temLinhaSemProduto(lista)) {
              e.preventDefault()
              setErroSubmit('Tem linha amarela sem produto escolhido. Escolha o produto dela — ou clique em "tirar" — antes de criar a nota.')
              return
            }
            setErroSubmit(null)
          }}
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5"
        >
          <p className="font-semibold text-gray-800">2. Confira os itens e complete os dados da nota</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Classe da nota (filtra a busca do produto)</label>
              <select value={classe} onChange={(e) => setClasse(e.target.value)} className="field">
                <option value="">— Não sei / misturada (busca em todo o catálogo) —</option>
                {CLASSES_NOTA.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
              </select>
            </div>
            <p className="pb-2 text-xs text-gray-500">
              É o que evita achar a peça parecida: com a classe escolhida, a busca olha só aquela família.
            </p>
          </div>

          {erroSubmit && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{erroSubmit}</div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Fornecedor <span className="text-red-500">*</span></label>
              <FornecedorSelect fornecedores={fornecedores} />
              <p className="mt-1 text-xs text-gray-400">Obrigatório — liga os itens ao fornecedor certo.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Número da NF</label>
              <input name="numero" className="field" defaultValue={proximoNumero} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Data de Entrada</label>
              <input name="data_entrada" type="date" defaultValue={hoje} className="field" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Data de Emissão</label>
              <input name="data_emissao" type="date" className="field" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Loja / Estoque que recebe <span className="text-red-500">*</span></label>
              <select name="deposito_id" defaultValue={depositoPadrao ?? ''} className="field">
                <option value="">— Escolha —</option>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.loja_id ? `${lojaNome.get(d.loja_id) ?? 'Loja'} · ` : ''}{d.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
              <textarea name="observacoes" rows={2} className="field" placeholder="Opcional..." />
            </div>
          </div>

          {lista.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum item na lista — leia as fotos de novo.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Item lido</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Produto no sistema</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Qtd</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Preço unit.</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lista.map((it, i) => {
                    const precisaEscolher = !it.produto_id || !!trocar[i]
                    return (
                      <tr key={`${i}-${it.descricao}`} className={precisaEscolher ? 'bg-amber-50/50' : ''}>
                        <td className="px-3 py-2.5 text-sm text-gray-700">{it.descricao}</td>
                        <td className="px-3 py-2.5">
                          {precisaEscolher ? (
                            <EscolherProduto
                              nomeCampo={`item_${i}_produto`}
                              idInicial={it.produto_id}
                              nomeInicial={trocar[i] ? it.produto_nome : null}
                              classe={classe}
                              onEscolher={(id) => setEscolhidos((s) => ({ ...s, [i]: id }))}
                            />
                          ) : (
                            <>
                              <input type="hidden" name={`item_${i}_produto`} value={it.produto_id ?? ''} />
                              <span className="text-sm text-gray-800">{it.produto_nome}</span>
                              {it.score < 1 && <span className="ml-1 text-xs text-amber-600">⚠ conferir</span>}
                              <button
                                type="button"
                                onClick={() => setTrocar((t) => ({ ...t, [i]: true }))}
                                className="ml-2 text-xs text-blue-600 hover:underline"
                              >
                                trocar
                              </button>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input name={`item_${i}_qtd`} type="number" step="1" min="1" defaultValue={it.quantidade}
                            className="w-20 rounded border border-gray-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input name={`item_${i}_preco`} type="number" step="0.01" min="0" defaultValue={it.preco ?? 0}
                            className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button type="button" onClick={() => removerLinha(i)} className="text-xs text-red-500 hover:underline">
                            tirar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Total dos itens: <b className="text-gray-900">{formatBRL(total)}</b>
            </p>
            <div className="flex items-center gap-2">
              <Link href="/painel/compras" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Cancelar
              </Link>
              <SubmitButton
                pendingText="Criando..."
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition"
              >
                Criar nota pendente
              </SubmitButton>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            A nota nasce <b>pendente</b> — o estoque só muda quando vocês clicarem em &quot;Confirmar Recebimento&quot; no detalhe dela.
            Produto que controla número de série ainda pede os números no detalhe da nota.
          </p>
        </form>
      )}
    </div>
  )
}