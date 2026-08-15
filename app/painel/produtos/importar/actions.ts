'use server'

import { createServiceClient, requirePermissao, fetchAll } from '@/lib/supabase/server'
import { lerXlsx } from '@/lib/xlsx'
import { COL, VAZIO } from '@/lib/planilha-produtos'
import { revalidatePath } from 'next/cache'

// Importa a tabela de itens exportada do SIGE.
//
// Casa pelo `Identificador` da planilha, que é o `produtos.id` daqui com o
// sufixo literal "idproduto" colado no fim. Atualiza o que já existe e insere o
// que é novo — nunca apaga. Produto que sumiu do SIGE fica no sistema.
//
// Substituir o catálogo seria destrutivo à toa: a planilha traz UM preço, e o
// sistema tem 7 tabelas de preço com 45 mil linhas que morreriam junto.
//
// A exportação é paginada (Produtos_1_ate_32.xlsx e por aí vai). Como cada
// arquivo só mexe no que ele traz, dá pra subir os arquivos em qualquer ordem.

export type Mudanca = {
  id: string
  codigo: string
  nome: string
  acao: 'novo' | 'atualizar'
  diffs: string[]
  campos: Record<string, unknown>
}

export type Conferencia = {
  aba: string
  abas: string[]
  produtos: number
  ignoradas: number
  novos: number
  atualizar: number
  semMudanca: number
  mudancas: Mudanca[]
  avisos: string[]
  erros: string[]
}

export type ResultadoConferencia =
  | { ok: false; erros: string[] }
  | { ok: true; conferencia: Conferencia }

const txt = (v: string | undefined): string => {
  const s = (v ?? '').trim()
  return s === VAZIO || s === '' ? '' : s
}

// Célula numérica de .xlsx vem SEMPRE com ponto decimal no XML ("2.5"), qualquer
// que seja o idioma do Excel — é o padrão OOXML. Só quando o valor é texto
// digitado é que pode vir no formato brasileiro ("1.234,56"), e aí tem vírgula.
// Tratar tudo como BR multiplicava todo custo por 10 ou 100.
const num = (v: string | undefined): number | null => {
  const s = txt(v)
  if (!s) return null
  const limpo = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

const simNao = (v: string | undefined): boolean | null => {
  const s = txt(v).toUpperCase()
  if (s === 'SIM') return true
  if (s === 'NÃO' || s === 'NAO') return false
  return null
}

type ProdutoBanco = {
  id: string; codigo: string | null; nome: string | null; categoria: string | null
  marca: string | null; preco: number | null; preco_custo: number | null
  preco_minimo: number | null; ean: string | null; prateleira: string | null
  modelo: string | null; unidade: string | null; ativo: boolean | null
  controla_serie: boolean | null; visivel_catalogo: boolean | null
}

export async function conferirImportacao(formData: FormData): Promise<ResultadoConferencia> {
  try {
    await requirePermissao('produtos')
  } catch {
    return { ok: false, erros: ['Sem permissao para mexer no cadastro de produtos.'] }
  }

  const file = formData.get('arquivo') as File | null
  if (!file || file.size === 0) return { ok: false, erros: ['Nenhum arquivo enviado.'] }

  let planilha
  try {
    planilha = await lerXlsx(await file.arrayBuffer(), (formData.get('aba') as string) || undefined)
  } catch {
    return {
      ok: false,
      erros: ['Nao consegui ler o arquivo. Precisa ser .xlsx — se o SIGE exportou .xls ou .csv, abra no Excel e salve como "Pasta de Trabalho do Excel (.xlsx)".'],
    }
  }

  const faltando = [COL.ident, COL.nome].filter((c) => !planilha.colunas.includes(c))
  if (faltando.length > 0) {
    return {
      ok: false,
      erros: [
        `A aba "${planilha.aba}" nao parece ser a exportacao de produtos do SIGE — faltam as colunas: ${faltando.join(', ')}.`,
        planilha.abas.length > 1 ? `Abas do arquivo: ${planilha.abas.join(', ')}.` : 'O arquivo so tem uma aba.',
      ],
    }
  }

  const supabase = await createServiceClient()

  const cats = await fetchAll<{ hierarquia: string; nome: string }>((de, ate) =>
    supabase.from('categorias').select('hierarquia, nome').range(de, ate))
  const catPorNome = new Map(cats.map((c) => [(c.nome ?? '').trim().toUpperCase(), c.hierarquia]))

  const idsPlanilha = planilha.linhas
    .map((l) => txt(l[COL.ident]).replace(/idproduto$/, ''))
    .filter(Boolean)

  const existentes: ProdutoBanco[] = []
  for (let i = 0; i < idsPlanilha.length; i += 300) {
    const { data } = await supabase
      .from('produtos')
      .select('id, codigo, nome, categoria, marca, preco, preco_custo, preco_minimo, ean, prateleira, modelo, unidade, ativo, controla_serie, visivel_catalogo')
      .in('id', idsPlanilha.slice(i, i + 300))
    existentes.push(...((data ?? []) as ProdutoBanco[]))
  }
  const porId = new Map(existentes.map((p) => [p.id, p]))

  const mudancas: Mudanca[] = []
  const erros: string[] = []
  const categoriasFaltando = new Set<string>()
  let semMudanca = 0
  let ignoradas = 0

  planilha.linhas.forEach((linha, i) => {
    const nLinha = i + 2
    const id = txt(linha[COL.ident]).replace(/idproduto$/, '')
    const nome = txt(linha[COL.nome])
    // A exportação do SIGE vem com milhares de linhas só de formatação.
    if (!id && !nome) { ignoradas++; return }
    if (!id) { erros.push(`Linha ${nLinha} (${nome || 'sem nome'}): sem Identificador.`); return }
    if (!nome) { erros.push(`Linha ${nLinha} (${id}): sem Nome.`); return }

    const nomeCat = txt(linha[COL.categoria])
    let categoria: string | null = null
    if (nomeCat) {
      categoria = catPorNome.get(nomeCat.toUpperCase()) ?? null
      if (!categoria) categoriasFaltando.add(nomeCat)
    }

    const inativo = simNao(linha[COL.inativo])
    const campos: Record<string, unknown> = {
      codigo: txt(linha[COL.codigo]) || null,
      nome,
      marca: txt(linha[COL.marca]) || null,
      preco: num(linha[COL.preco]) ?? 0,
      preco_custo: num(linha[COL.custo]) ?? 0,
      preco_minimo: num(linha[COL.precoMin]) ?? 0,
      ean: txt(linha[COL.ean]) || null,
      prateleira: txt(linha[COL.prateleira]) || null,
      modelo: txt(linha[COL.modelo]) || null,
      unidade: txt(linha[COL.unidade]) || null,
      ativo: inativo === null ? true : !inativo,
      controla_serie: simNao(linha[COL.serie]) ?? false,
      visivel_catalogo: simNao(linha[COL.catalogo]) ?? true,
    }
    // Categoria só entra quando foi possível traduzir — senão a FK derruba o insert.
    if (categoria) campos.categoria = categoria

    const atual = porId.get(id)
    if (!atual) {
      mudancas.push({ id, codigo: String(campos.codigo ?? ''), nome, acao: 'novo', diffs: [], campos })
      return
    }

    const diffs: string[] = []
    const compara = (chave: keyof ProdutoBanco, rotulo: string, fmt = (v: unknown) => String(v ?? '—')) => {
      const antes = atual[chave]
      const depois = campos[chave]
      if (depois === undefined) return
      const iguais = typeof depois === 'number'
        ? Math.abs(Number(antes ?? 0) - depois) < 0.005
        : String(antes ?? '') === String(depois ?? '')
      if (!iguais) diffs.push(`${rotulo}: ${fmt(antes)} → ${fmt(depois)}`)
    }
    const brl = (v: unknown) => 'R$ ' + Number(v ?? 0).toFixed(2)
    compara('nome', 'Nome')
    compara('codigo', 'Código')
    compara('marca', 'Marca')
    compara('categoria', 'Categoria')
    compara('preco', 'Preço', brl)
    compara('preco_custo', 'Custo', brl)
    compara('preco_minimo', 'Preço mín.', brl)
    compara('ean', 'EAN')
    compara('prateleira', 'Prateleira')
    compara('modelo', 'Modelo')
    compara('unidade', 'Unidade')
    compara('ativo', 'Ativo', (v) => (v ? 'sim' : 'não'))
    compara('controla_serie', 'Controla IMEI', (v) => (v ? 'sim' : 'não'))
    compara('visivel_catalogo', 'No catálogo', (v) => (v ? 'sim' : 'não'))

    if (diffs.length === 0) semMudanca++
    else mudancas.push({ id, codigo: String(campos.codigo ?? ''), nome, acao: 'atualizar', diffs, campos })
  })

  const avisos: string[] = []
  if (categoriasFaltando.size > 0) {
    avisos.push(
      `Categoria nao cadastrada aqui: ${[...categoriasFaltando].join(', ')}. ` +
      `Os produtos entram sem categoria — cadastre em Categorias e reenvie pra corrigir.`
    )
  }

  return {
    ok: true,
    conferencia: {
      aba: planilha.aba,
      abas: planilha.abas,
      produtos: planilha.linhas.length - ignoradas,
      ignoradas,
      novos: mudancas.filter((m) => m.acao === 'novo').length,
      atualizar: mudancas.filter((m) => m.acao === 'atualizar').length,
      semMudanca,
      mudancas,
      avisos,
      erros,
    },
  }
}

export async function aplicarImportacao(
  mudancas: Mudanca[]
): Promise<{ ok: boolean; novos: number; atualizados: number; erro?: string }> {
  await requirePermissao('produtos')
  if (!Array.isArray(mudancas) || mudancas.length === 0) {
    return { ok: false, novos: 0, atualizados: 0, erro: 'Nada para aplicar.' }
  }
  const supabase = await createServiceClient()

  let novos = 0
  let atualizados = 0

  for (let i = 0; i < mudancas.length; i += 200) {
    const lote = mudancas.slice(i, i + 200)
    const linhas = lote.map((m) => ({ id: m.id, ...m.campos }))
    const { error } = await supabase.from('produtos').upsert(linhas, { onConflict: 'id' })
    if (error) {
      return {
        ok: false, novos, atualizados,
        erro: `${error.message}. Foram gravados ${novos + atualizados} produtos antes de parar.`,
      }
    }
    novos += lote.filter((m) => m.acao === 'novo').length
    atualizados += lote.filter((m) => m.acao === 'atualizar').length
  }

  revalidatePath('/painel/produtos')
  revalidatePath('/painel/catalogo')
  return { ok: true, novos, atualizados }
}
