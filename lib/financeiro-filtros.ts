// FILTROS DO FINANCEIRO — um lugar só.
//
// Antes esta lógica vivia dentro de app/painel/financeiro/page.tsx. Quando o CSV
// passou a ser gerado no servidor (para a tela parar de mandar 2 MB de linhas ao
// navegador), ele precisou do MESMO filtro — e filtro duplicado é filtro que
// divergiu. Então a regra saiu da tela e virou esta função pura: a tela e a rota
// de exportação chamam a mesma coisa e não têm como discordar.
//
// Regras que continuam valendo aqui:
//  - sem filtro de data, o recorte é o MÊS ATUAL (tudo=1 abre o histórico);
//  - a loja é a loja ativa da sessão, salvo 'todas' ou 'sem';
//  - 'pendente' significa "diferente de pago" (inclui linha sem status);
//  - busca é sem frescura de acento (cada vogal e cada c vira curinga '_').

/* eslint-disable @typescript-eslint/no-explicit-any */
import { categoriasDoSetor } from './financeiro-setores'
import { hojeSP } from './utils'

export type ParamsFinanceiro = {
  tipo?: string; busca?: string; ordem?: string; dir?: string; status?: string
  de?: string; ate?: string; vence?: string; campo?: string
  pessoa?: string; forma?: string; conta?: string; categoria?: string; subcategoria?: string
  setor?: string; valor_min?: string; valor_max?: string; origem?: string
  loja?: string; tudo?: string; pagina?: string; agrupar?: string
}

export const CAMPOS_DATA = ['data_vencimento', 'data_competencia', 'data_pagamento']

export function campoDataDe(params: ParamsFinanceiro): string {
  return CAMPOS_DATA.includes(params.campo ?? '') ? params.campo! : 'data_vencimento'
}

// De/até efetivos do recorte (mês atual por padrão).
export function periodoDe(params: ParamsFinanceiro): { mesIni: string; mesFim: string; de?: string; ate?: string; verTudo: boolean } {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const hojeD = new Date(hojeSP() + 'T12:00:00')
  const mesIni = hojeSP().slice(0, 7) + '-01'
  const mesFim = iso(new Date(hojeD.getFullYear(), hojeD.getMonth() + 1, 0))
  const verTudo = params.tudo === '1'
  return { mesIni, mesFim, de: params.de ?? (verTudo ? undefined : mesIni), ate: params.ate ?? (verTudo ? undefined : mesFim), verTudo }
}

// Filtro SÓ de loja (usado também pelos cartões de resumo).
export function aplicarLoja(q: any, lojaEfetiva: string | null): any {
  if (lojaEfetiva === 'sem') return q.is('loja_id', null)
  if (lojaEfetiva !== 'todas') return q.eq('loja_id', lojaEfetiva)
  return q
}

export function aplicarFiltros(q: any, params: ParamsFinanceiro, ctx: { lojaEfetiva: string | null }): any {
  q = aplicarLoja(q, ctx.lojaEfetiva)
  const campoData = campoDataDe(params)
  const { mesIni, mesFim, de, ate } = periodoDe(params)

  if (params.tipo === 'pagar' || params.tipo === 'receber') q = q.eq('tipo', params.tipo)
  if (params.busca) {
    for (const w of params.busca.replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)) {
      // Busca sem acento: "salarios" acha "Salários", "franca" acha "França".
      // ponytail: pode trazer alguma linha a mais de mesmo tamanho e mesmas
      // consoantes; se incomodar, a saída é coluna gerada com unaccent() no banco.
      const padrao = w.length >= 3 ? w.toLowerCase().replace(/[aeiouc]/g, '_') : w
      q = q.or(`descricao.ilike.%${padrao}%,pessoa_nome.ilike.%${padrao}%,categoria.ilike.%${padrao}%`)
    }
  }
  if (params.pessoa) q = q.ilike('pessoa_nome', `%${params.pessoa}%`)
  if (params.forma) q = q.eq('forma_pagamento', params.forma)
  if (params.conta) q = q.eq('conta_id', params.conta)
  if (params.categoria) q = q.eq('categoria', params.categoria)
  if (params.subcategoria) q = q.eq('subcategoria', params.subcategoria)
  if (params.setor) {
    // Setor vem antes da categoria: escolher Funcionários já restringe àquelas
    // categorias, e a cascata da tela só oferece as do setor escolhido.
    const cats = categoriasDoSetor(params.setor)
    if (params.setor === 'sem_categoria') q = q.is('categoria', null)
    else if (cats.length) q = q.in('categoria', cats)
  }
  if (params.valor_min) q = q.gte('valor', Number(params.valor_min))
  if (params.valor_max) q = q.lte('valor', Number(params.valor_max))

  // ORIGEM: de onde o lançamento nasceu (venda, fiado ou digitado à mão).
  if (params.origem === 'venda') q = q.not('venda_id', 'is', null).neq('categoria', 'Fiado (a receber)')
  else if (params.origem === 'fiado') q = q.eq('categoria', 'Fiado (a receber)')
  else if (params.origem === 'manual') q = q.is('venda_id', null)

  // VENCE EM: janela para frente.
  if (params.vence === 'hoje') q = q.eq('data_vencimento', hojeSP())
  else if (params.vence === '7dias') q = q.gte('data_vencimento', hojeSP()).lte('data_vencimento', hojeSP(7))
  else if (params.vence === 'mes') q = q.gte('data_vencimento', mesIni).lte('data_vencimento', mesFim)

  if (params.status === 'pago') q = q.eq('status', 'pago')
  else if (params.status === 'pendente') q = q.neq('status', 'pago')
  else if (params.status === 'vencido') q = q.neq('status', 'pago').lt('data_vencimento', hojeSP())

  if (de) q = q.gte(campoData, de)
  if (ate) q = q.lte(campoData, ate)
  return q
}

// Querystring do filtro atual, para a rota de exportação repetir o mesmo recorte.
export const CHAVES_EXPORTACAO = [
  'tipo', 'busca', 'status', 'de', 'ate', 'pessoa', 'forma', 'conta', 'categoria', 'subcategoria',
  'setor', 'valor_min', 'valor_max', 'origem', 'vence', 'campo', 'loja', 'tudo', 'ordem', 'dir',
] as const

export function querystringDoFiltro(params: ParamsFinanceiro): string {
  const sp = new URLSearchParams()
  for (const k of CHAVES_EXPORTACAO) {
    const v = (params as Record<string, string | undefined>)[k]
    if (v) sp.set(k, v)
  }
  return sp.toString()
}
