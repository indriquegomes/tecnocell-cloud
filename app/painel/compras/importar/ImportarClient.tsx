'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/Spinner'
import { SubmitButton } from '@/components/SubmitButton'
import { FornecedorSelect } from '../FornecedorSelect'
import { lerNotaFotos, criarNotasDosItens, type LeituraResultado } from '../actions'
import { formatBRL } from '@/lib/utils'
import { CLASSES_NOTA } from '@/lib/nota-classes'
import { comprimirFoto } from '@/lib/comprimir-foto'
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
type GrupoTela = { itens: ItemLidoTela[]; classe: string }

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
  // Uma leitura = uma nota: as fotos são páginas dela e os itens somam numa lista só.
  const [grupos, setGrupos] = useState<GrupoTela[] | null>(null)
  const [trocar, setTrocar] = useState<Record<string, boolean>>({})
  const [escolhidos, setEscolhidos] = useState<Record<string, string>>({})
  const [erroSubmit, setErroSubmit] = useState<string | null>(null)
  // De que trata a nota (frontal, bateria, acessório…) — vale para a leitura e para
  // a busca de produto de cada linha. É o que evita casar a peça parecida.
  const [classe, setClasse] = useState<string>('')
  // Fotos escolhidas: são comprimidas no navegador antes de subir (a server action
  // tem teto de 4 MB e foto de celular tem 2–4 MB cada).
  const [arquivos, setArquivos] = useState<File[]>([])
  const [comprimindo, setComprimindo] = useState(false)
  const [tamanhoEnviado, setTamanhoEnviado] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  const enviarFotos = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!arquivos.length || comprimindo) return
    setComprimindo(true)
    setTamanhoEnviado(null)
    try {
      const fd = new FormData()
      fd.set('classe', classe)
      let total = 0
      for (const f of arquivos) {
        const comp = await comprimirFoto(f)
        total += comp.size
        fd.append('fotos', comp, comp.name)
      }
      setTamanhoEnviado(total)
      startTransition(() => formLer(fd))
    } finally {
      setComprimindo(false)
    }
  }

  useEffect(() => {
    if (leitura?.ok) {
      setGrupos(leitura.grupos.map((g) => ({ itens: g.itens as ItemLidoTela[], classe: g.classe ?? '' })))
      setTrocar({})
      setEscolhidos({})
      const primeira = leitura.grupos.find((g) => g.classe)?.classe
      if (primeira) setClasse(primeira)
    }
  }, [leitura])

  const lojaNome = new Map(lojas.map((l) => [l.id, l.nome]))
  const lista = grupos ?? []
  const total = lista.reduce((s, g) => s + g.itens.reduce((t, i) => t + i.quantidade * (i.preco ?? 0), 0), 0)
  const chave = (g: number, i: number) => `${g}-${i}`

  function removerLinha(g: number, i: number) {
    setGrupos((atual) => (atual ?? []).map((grupo, gi) =>
      gi === g ? { ...grupo, itens: grupo.itens.filter((_, ii) => ii !== i) } : grupo))
  }
  function trocarClasseGrupo(g: number, valor: string) {
    setGrupos((atual) => (atual ?? []).map((grupo, gi) => (gi === g ? { ...grupo, classe: valor } : grupo)))
  }

  // Linha sem produto: se a pessoa não escolheu nenhum, a nota não pode ser criada
  // (item ficaria de fora sem avisar).
  function temLinhaSemProduto(atual: GrupoTela[]): boolean {
    return atual.some((g, gi) => g.itens.some((it, i) => {
      const precisaEscolher = !it.produto_id || !!trocar[chave(gi, i)]
      const escolhido = escolhidos[chave(gi, i)] ?? it.produto_id ?? ''
      return precisaEscolher && !escolhido
    }))
  }

  return (
    <div className="space-y-6">
      <AjudaNota />

      {/* 1. fotos */}
      <form onSubmit={enviarFotos} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <p className="font-semibold text-gray-800">1. Anexe as fotos da nota</p>
        <p className="text-sm text-gray-500">
          Mande a nota inteira: uma foto por página. Todas as páginas viram <b>uma nota só</b> — os itens somam.
        </p>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">De que trata a nota?</label>
          <select name="classe" value={classe} onChange={(e) => setClasse(e.target.value)} className="field">
            <option value="">— Não sei / misturada (busca em todo o catálogo) —</option>
            {CLASSES_NOTA.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            Escolher a classe faz o app procurar só naquela família (ex.: frontais) em vez do catálogo
            inteiro. Se você escrever no topo da nota (&quot;TELAS E FRONTAIS&quot;), ele também entende sozinho.
          </p>
        </div>

        <input
          type="file"
          multiple
          required
          accept="image/*"
          onChange={(e) => { setArquivos(Array.from(e.target.files ?? [])); setTamanhoEnviado(null) }}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
        />
        {arquivos.length > 0 && (
          <p className="text-xs text-gray-500">
            {arquivos.length} foto{arquivos.length === 1 ? '' : 's'} ·{' '}
            {(arquivos.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB
            {' — '}comprimidas no envio (cabe uma nota de até ~10 páginas)
            {tamanhoEnviado !== null && ` · enviadas com ${(tamanhoEnviado / 1024 / 1024).toFixed(2)} MB`}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={lendo || comprimindo || arquivos.length === 0}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {comprimindo ? (
              <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Preparando as fotos...</span>
            ) : lendo ? (
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
      {leitura?.ok && leitura.aviso && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{leitura.aviso}</div>
      )}

      {/* 2. conferir e criar */}
      {grupos && (
        <form
          action={criarNotasDosItens}
          onSubmit={(e) => {
            if (temLinhaSemProduto(lista)) {
              e.preventDefault()
              setErroSubmit('Tem linha amarela sem produto escolhido. Escolha o produto dela — ou clique em "tirar" — antes de criar a nota.')
              return
            }
            setErroSubmit(null)
          }}
          className="space-y-5"
        >
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
            <p className="font-semibold text-gray-800">2. Dados que valem para {lista.length > 1 ? 'todas as notas' : 'a nota'}</p>
            {erroSubmit && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{erroSubmit}</div>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
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
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {lista.length > 1 ? 'Primeiro número de NF (as outras seguem +1)' : 'Número da NF'}
                </label>
                <input name="numero_base" className="field" defaultValue={proximoNumero} />
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
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
                <textarea name="observacoes" rows={2} className="field" placeholder="Opcional..." />
              </div>
            </div>
          </div>

          {lista.map((grupo, g) => {
            const subtotal = grupo.itens.reduce((s, i) => s + i.quantidade * (i.preco ?? 0), 0)
            return (
              <div key={g} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <p className="font-semibold text-gray-800">
                    {lista.length > 1 ? `Nota ${g + 1}` : '3. Confira os itens'}
                  </p>
                  <span className="text-xs text-gray-500">Subtotal {formatBRL(subtotal)}</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Fornecedor <span className="text-red-500">*</span></label>
                    <FornecedorSelect fornecedores={fornecedores} name={`nota_${g}_fornecedor`} />
                    <p className="mt-1 text-xs text-gray-400">Obrigatório — liga os itens ao fornecedor certo.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Nº da NF</label>
                      <input name={`nota_${g}_numero`} className="field" defaultValue={lista.length > 1 ? String(Number(proximoNumero) + g) : proximoNumero} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Classe (filtra a busca)</label>
                      <select value={grupo.classe} onChange={(e) => trocarClasseGrupo(g, e.target.value)} className="field">
                        <option value="">— catálogo inteiro —</option>
                        {CLASSES_NOTA.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {grupo.itens.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum item lido nesta foto — ela fica de fora se você não escolher fornecedor.</p>
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
                        {grupo.itens.map((it, i) => {
                          const k = chave(g, i)
                          const precisaEscolher = !it.produto_id || !!trocar[k]
                          return (
                            <tr key={`${k}-${it.descricao}`} className={precisaEscolher ? 'bg-amber-50/50' : ''}>
                              <td className="px-3 py-2.5 text-sm text-gray-700">{it.descricao}</td>
                              <td className="px-3 py-2.5">
                                {precisaEscolher ? (
                                  <EscolherProduto
                                    nomeCampo={`nota_${g}_item_${i}_produto`}
                                    idInicial={it.produto_id}
                                    nomeInicial={trocar[k] ? it.produto_nome : null}
                                    classe={grupo.classe}
                                    onEscolher={(id) => setEscolhidos((s) => ({ ...s, [k]: id }))}
                                  />
                                ) : (
                                  <>
                                    <input type="hidden" name={`nota_${g}_item_${i}_produto`} value={it.produto_id ?? ''} />
                                    <span className="text-sm text-gray-800">{it.produto_nome}</span>
                                    {it.score < 1 && <span className="ml-1 text-xs text-amber-600">⚠ conferir</span>}
                                    <button
                                      type="button"
                                      onClick={() => setTrocar((t) => ({ ...t, [k]: true }))}
                                      className="ml-2 text-xs text-blue-600 hover:underline"
                                    >
                                      trocar
                                    </button>
                                  </>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <input name={`nota_${g}_item_${i}_qtd`} type="number" step="1" min="1" defaultValue={it.quantidade}
                                  className="w-20 rounded border border-gray-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <input name={`nota_${g}_item_${i}_preco`} type="number" step="0.01" min="0" defaultValue={it.preco ?? 0}
                                  className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button type="button" onClick={() => removerLinha(g, i)} className="text-xs text-red-500 hover:underline">
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
              </div>
            )
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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
                {lista.length > 1 ? `Criar ${lista.length} notas pendentes` : 'Criar nota pendente'}
              </SubmitButton>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            As notas nascem <b>pendentes</b> — o estoque só muda quando vocês clicarem em &quot;Confirmar Recebimento&quot; em cada uma.
            Produto que controla número de série ainda pede os números no detalhe da nota.
          </p>
        </form>
      )}
    </div>
  )
}
