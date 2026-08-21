'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { CategoriaML, AtributoCategoriaML } from '@/lib/mercado-livre'
import {
  buscarCategoriasFilhasAction, buscarAtributosCategoriaAction,
  salvarRascunho, uploadFotoAnuncio, publicarRascunho, excluirRascunho,
} from '../actions'
import type { RascunhoAnuncio } from './page'

type Crumb = { id: string; nome: string }

export function RascunhoEditor({
  rascunho, produtoNome, produtoCodigo, produtoImagem,
}: {
  rascunho: RascunhoAnuncio
  produtoNome: string
  produtoCodigo: string | null
  produtoImagem: string | null
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Não guardamos o caminho completo até a raiz — quando já tem categoria
  // escolhida, mostra ela pronta; "Trocar categoria" reinicia a navegação
  // do zero em vez de tentar reconstruir o caminho (a API não devolve o
  // caminho de volta, só os filhos de cada nível).
  const [categoriaId, setCategoriaId] = useState(rascunho.categoria_ml_id)
  const [categoriaNome, setCategoriaNome] = useState(rascunho.categoria_ml_nome)
  const [navegando, setNavegando] = useState(!rascunho.categoria_ml_id)
  const [caminho, setCaminho] = useState<Crumb[]>([])
  const [historico, setHistorico] = useState<CategoriaML[][]>([])
  const [opcoesAtuais, setOpcoesAtuais] = useState<CategoriaML[]>([])
  const [carregandoCategorias, setCarregandoCategorias] = useState(false)

  const [atributos, setAtributos] = useState<AtributoCategoriaML[]>([])
  const [valoresAtributos, setValoresAtributos] = useState<Record<string, string>>(rascunho.atributos ?? {})
  const [carregandoAtributos, setCarregandoAtributos] = useState(false)

  const [titulo, setTitulo] = useState(rascunho.titulo ?? produtoNome)
  const [preco, setPreco] = useState(String(rascunho.preco ?? ''))
  const [fotos, setFotos] = useState<string[]>(rascunho.fotos?.length ? rascunho.fotos : produtoImagem ? [produtoImagem] : [])
  const [enviandoFoto, setEnviandoFoto] = useState(false)

  const [salvando, setSalvando] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState(rascunho.erro_publicacao ?? '')

  const carregarNivel = async (id: string | null) => {
    setCarregandoCategorias(true)
    try {
      const opcoes = await buscarCategoriasFilhasAction(rascunho.conexao_id, id)
      setOpcoesAtuais(opcoes)
      if (id === null) setHistorico([opcoes])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar categorias do Mercado Livre.')
    } finally {
      setCarregandoCategorias(false)
    }
  }

  const iniciarNavegacao = () => {
    setNavegando(true)
    setCaminho([])
    if (historico.length === 0) carregarNivel(null)
    else setOpcoesAtuais(historico[0])
  }

  const escolherCategoria = async (cat: CategoriaML) => {
    setCarregandoCategorias(true)
    setErro('')
    try {
      const filhas = await buscarCategoriasFilhasAction(rascunho.conexao_id, cat.id)
      if (filhas.length === 0) {
        // Categoria folha — fim da navegação.
        setCategoriaId(cat.id)
        setCategoriaNome(cat.nome)
        setNavegando(false)
        await salvarRascunho(rascunho.id, { categoriaId: cat.id, categoriaNome: cat.nome })
        carregarAtributos(cat.id)
      } else {
        setCaminho((prev) => [...prev, { id: cat.id, nome: cat.nome }])
        setHistorico((prev) => [...prev, filhas])
        setOpcoesAtuais(filhas)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar categorias do Mercado Livre.')
    } finally {
      setCarregandoCategorias(false)
    }
  }

  const voltarPraCrumb = (indice: number) => {
    setCaminho((prev) => prev.slice(0, indice))
    setOpcoesAtuais(historico[indice])
    setHistorico((prev) => prev.slice(0, indice + 1))
  }

  const carregarAtributos = async (catId: string) => {
    setCarregandoAtributos(true)
    setErro('')
    try {
      const lista = await buscarAtributosCategoriaAction(rascunho.conexao_id, catId)
      setAtributos(lista)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar atributos da categoria.')
    } finally {
      setCarregandoAtributos(false)
    }
  }

  // No mount: se já tem categoria escolhida (rascunho salvo antes), busca
  // os atributos direto; senão, já carrega as categorias-raiz pra navegação
  // começar sem precisar de um clique extra. eslint-disable: deve rodar só
  // uma vez — categoriaId inicial nunca muda por fora do fluxo de
  // escolherCategoria, que já cuida de buscar os atributos sozinho.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (rascunho.categoria_ml_id) carregarAtributos(rascunho.categoria_ml_id)
    else carregarNivel(null)
  }, [])

  const handleUploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setEnviandoFoto(true)
    setErro('')
    try {
      const formData = new FormData()
      formData.set('file', arquivo)
      const res = await uploadFotoAnuncio(formData)
      if (res.ok && res.url) setFotos((prev) => [...prev, res.url as string])
      else setErro(res.erro ?? 'Falha ao enviar foto.')
    } finally {
      setEnviandoFoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removerFoto = (url: string) => setFotos((prev) => prev.filter((f) => f !== url))

  const salvar = async () => {
    setSalvando(true)
    setMensagem('')
    setErro('')
    const res = await salvarRascunho(rascunho.id, {
      titulo, preco: parseFloat(preco.replace(',', '.')) || null, atributos: valoresAtributos, fotos,
    })
    setSalvando(false)
    if (res.ok) setMensagem('Rascunho salvo.')
    else setErro(res.erro ?? 'Falha ao salvar.')
  }

  const publicar = async () => {
    setPublicando(true)
    setMensagem('')
    setErro('')
    // Garante que o que está na tela foi salvo antes de publicar.
    await salvarRascunho(rascunho.id, {
      titulo, preco: parseFloat(preco.replace(',', '.')) || null, atributos: valoresAtributos, fotos,
    })
    const res = await publicarRascunho(rascunho.id)
    setPublicando(false)
    if (res.ok) {
      setMensagem('Anúncio publicado com sucesso!')
      router.push('/painel/integracoes/produtos')
    } else {
      setErro(res.erro ?? 'Falha ao publicar.')
    }
  }

  const jaPublicado = rascunho.status === 'publicado'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Publicar no Mercado Livre</h2>
        <p className="text-sm text-gray-500">
          Produto: <span className="font-medium text-gray-700">{produtoNome}</span>
          {produtoCodigo && <span className="text-gray-400"> · código {produtoCodigo}</span>}
        </p>
      </div>

      {jaPublicado && (
        <p className="rounded-xl bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
          Este anúncio já foi publicado (ml_item_id: {rascunho.ml_item_id}).
        </p>
      )}

      {erro && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{erro}</p>}
      {mensagem && <p className="rounded-xl bg-green-50 px-4 py-2 text-sm font-medium text-green-700">{mensagem}</p>}

      {/* Categoria */}
      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-gray-800">Categoria no Mercado Livre</h3>
        {categoriaId && !navegando ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-700">{categoriaNome}</p>
            <button type="button" onClick={iniciarNavegacao} className="text-xs font-medium text-blue-600 hover:underline">
              Trocar categoria
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {caminho.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
                <button type="button" onClick={() => voltarPraCrumb(0)} className="hover:underline">Início</button>
                {caminho.map((c, i) => (
                  <span key={c.id} className="flex items-center gap-1">
                    <span>/</span>
                    <button type="button" onClick={() => voltarPraCrumb(i + 1)} className="hover:underline">{c.nome}</button>
                  </span>
                ))}
              </div>
            )}
            {carregandoCategorias ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {opcoesAtuais.map((c) => (
                  <button key={c.id} type="button" onClick={() => escolherCategoria(c)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50">
                    {c.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Atributos — só depois de escolher a categoria */}
      {categoriaId && (
        <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800">Dados exigidos pelo Mercado Livre nesta categoria</h3>
          {carregandoAtributos ? (
            <p className="text-sm text-gray-400">Carregando atributos...</p>
          ) : (
            <div className="space-y-3">
              {atributos.map((a) => (
                <label key={a.id} className="block space-y-1">
                  <span className="text-sm font-medium text-gray-700">
                    {a.nome}{a.obrigatorio && <span className="text-red-500"> *</span>}
                  </span>
                  {a.valores.length > 0 ? (
                    <select
                      value={valoresAtributos[a.id] ?? ''}
                      onChange={(e) => setValoresAtributos((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    >
                      <option value="">Selecione...</option>
                      {a.valores.map((v) => <option key={v.id} value={v.nome}>{v.nome}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={valoresAtributos[a.id] ?? ''}
                      onChange={(e) => setValoresAtributos((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      maxLength={a.valorMaximo ?? undefined}
                      placeholder={a.dica ?? ''}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                  )}
                </label>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Título, preço, fotos */}
      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">
            Título do anúncio <span className="text-xs font-normal text-gray-400">(pode ser diferente do nome do produto — evite marca de terceiro sem autorização)</span>
          </span>
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={60}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">Preço (R$)</span>
          <input type="text" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>

        <div className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Fotos</span>
          <div className="flex flex-wrap gap-2">
            {fotos.map((url) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-20 w-20 rounded-lg border border-gray-200 object-cover" />
                <button type="button" onClick={() => removerFoto(url)}
                  className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">×</button>
              </div>
            ))}
            <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400 hover:bg-gray-50">
              {enviandoFoto ? '...' : '+ Foto'}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUploadFoto} className="hidden" disabled={enviandoFoto} />
            </label>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" onClick={salvar} disabled={salvando}
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
          {salvando ? 'Salvando...' : 'Salvar rascunho'}
        </button>
        <button type="button" onClick={publicar} disabled={publicando || jaPublicado}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {publicando ? 'Publicando...' : jaPublicado ? 'Já publicado' : 'Publicar no Mercado Livre'}
        </button>
        {!jaPublicado && (
          <form action={excluirRascunho.bind(null, rascunho.id, rascunho.conexao_id)}>
            <button type="submit" className="text-sm text-red-600 hover:underline">Descartar rascunho</button>
          </form>
        )}
      </div>
    </div>
  )
}
