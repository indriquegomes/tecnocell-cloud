// PORTEIRO DO DINHEIRO — valida o que pode entrar em `lancamentos` pela tela.
//
// O formulário do Financeiro era folha em branco: categoria e forma de pagamento
// aceitavam qualquer palavra (as listas só *sugeriam*) e "quitado" gravava pago com
// qualquer conta. Em 25/11/2026 isso virou `FONE QUE VITÃO PEGOU NA LOJA` — R$ 49,00
// lançados como despesa paga na conta Teresópolis por uma peça que saiu da loja.
//
// Regra que este arquivo garante (e o banco repete no trigger):
//   1. categoria tem que ser uma da lista oficial (`lib/financeiro-setores.ts`);
//   2. linha PAGA tem que dizer a forma de pagamento, e ela tem que existir no
//      cadastro de formas (nada de "Outros");
//   3. saída de dinheiro paga tem que ter origem: conta OU gaveta (forma dinheiro).
//
// Função pura de propósito: o teste roda sem banco (`test/validacao-lancamento.test.ts`).
//
// ponytail: valida só o caminho MANUAL (novo lançamento / edição). Os lançamentos
// automáticos (venda, fiado, devolução, RPC) já nascem com categoria própria e não
// passam por aqui — quem os segura é o trigger do banco, que só exige categoria
// conhecida.

import { TODAS_CATEGORIAS } from '@/lib/financeiro-setores'

/** Categorias que só o código/RPC escreve — nunca oferecidas no formulário. */
export const CATEGORIAS_AUTOMATICAS = [
  'Comissão Marketplace',
  'Sangria / Retirada',
  'Estorno de crédito',
]

/** Grafias antigas que existem na base: aceitas para não perder dado histórico. */
const GRAFIAS_LEGADAS = new Set([
  'vale transporte',
  'motoboy',
  'fornecedor / mercadoria',
  'fornecedor/mercadoria',
  'fonecedor',
  'despesas loja',
  'estorno',
])

export const categoriasAceitas = (): string[] => [
  ...TODAS_CATEGORIAS,
  ...CATEGORIAS_AUTOMATICAS,
]

const semAcentoBarras = (t: string | null | undefined) =>
  (t ?? '').trim().toLowerCase().replace(/\s*\/\s*/g, '/')

const OFICIAIS = new Set(categoriasAceitas().map(semAcentoBarras))

export const ehCategoriaAceita = (categoria: string | null | undefined): boolean => {
  const alvo = semAcentoBarras(categoria)
  if (!alvo) return false
  return OFICIAIS.has(alvo) || GRAFIAS_LEGADAS.has(alvo)
}

/** Formas que nunca valem como pagamento (não dizem de onde saiu o dinheiro). */
const FORMAS_PROIBIDAS = new Set(['outros', ''])

export type EntradaLancamento = {
  categoria: string | null
  forma: string | null
  tipo: string
  quitado: boolean
  contaId: string | null
  /** nomes válidos vindos de `formas_pagamento` (ativos) */
  formasValidas: string[]
  /** categoria que a linha já tinha — edição sem trocar de categoria continua valendo */
  categoriaAtual?: string | null
  /** `pagar` quitado só pode sair da gaveta quando a forma é dinheiro */
  ehDinheiro?: (forma: string) => boolean
  /** texto do lançamento — usado para barrar devolução digitada à mão */
  descricao?: string | null
  /** devolução ligada à linha (só o fluxo de Devoluções grava isso) */
  devolucaoId?: string | null
}

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string }

const normaliza = (t: string) => t.trim().toLowerCase()

export function validarEntradaLancamento(e: EntradaLancamento): ResultadoValidacao {
  const categoria = (e.categoria ?? '').trim()

  if (!categoria) {
    return { ok: false, erro: 'Escolha a categoria do lançamento — é ela que diz se isso é despesa, mercadoria, salário ou dinheiro do sócio.' }
  }
  const mantemCategoriaAtual = !!e.categoriaAtual && normaliza(categoria) === normaliza(String(e.categoriaAtual))
  if (!ehCategoriaAceita(categoria) && !mantemCategoriaAtual) {
    return { ok: false, erro: `A categoria "${categoria}" não existe na lista do financeiro. Escolha uma das opções (Aluguel, Mercadoria, Salários, Particular…).` }
  }

  const forma = (e.forma ?? '').trim()

  if (e.quitado) {
    if (!forma) {
      return { ok: false, erro: 'Lançamento pago precisa dizer a forma de pagamento (dinheiro, PIX, cartão…).' }
    }
    if (FORMAS_PROIBIDAS.has(normaliza(forma))) {
      return { ok: false, erro: '"Outros" não diz de onde saiu o dinheiro. Escolha a forma real: dinheiro, PIX, débito ou crédito.' }
    }
    const valida = e.formasValidas.some((f) => normaliza(f) === normaliza(forma))
    if (!valida) {
      return { ok: false, erro: `A forma "${forma}" não está no cadastro de formas de pagamento. Escolha uma da lista.` }
    }
    // Saída de dinheiro: ou sai de uma conta (banco/cofre) ou da gaveta (dinheiro).
    if (e.tipo === 'pagar' && !e.contaId) {
      const dinheiro = e.ehDinheiro ? e.ehDinheiro(forma) : normaliza(forma).includes('dinheiro')
      if (!dinheiro) {
        return { ok: false, erro: `Pagamento em ${forma} sem conta: escolha de qual conta o dinheiro saiu (ou use "Dinheiro" se saiu da gaveta).` }
      }
    }
  }

  // DEVOLUÇÃO À MÃO É O FURO-MÃE (26/11/2026).
  //
  // Dava para digitar "Devolução — FULANO" no formulário do Financeiro e gravar como
  // paga em PIX sem existir devolução nenhuma — no lote de 22/11 isso criou 44 linhas.
  // Resultado: PIX do PagBank sem compra cancelada atrás, estoque que nunca voltou e
  // crédito de cliente que nunca existiu. Estorno só nasce pela tela de Devoluções,
  // que é quem grava `devolucao_id`, mexe no estoque e no crédito de uma vez.
  const descricao = String(e.descricao ?? '').trim()
  const pareceDevolucao = /^(devolu[çc][ãa]o|estorno\s+de\s+cr[ée]dito)\b/i.test(descricao)
  if (pareceDevolucao && !e.devolucaoId) {
    return {
      ok: false,
      erro: 'Devolução/estorno não se lança à mão: registre em Devoluções (é lá que a peça volta ao estoque e o reembolso fica ligado à venda). Para dinheiro que saiu sem compra cancelada, use uma categoria de despesa.',
    }
  }

  return { ok: true }
}
