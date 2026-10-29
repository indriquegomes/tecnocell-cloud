import { createServiceClient, fetchAll, requirePermissao } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { aplicarFiltros, periodoDe } from '@/lib/financeiro-filtros'
import { hojeSP } from '@/lib/utils'
import type { NextRequest } from 'next/server'

// CSV DO FINANCEIRO — gerado no servidor, com o MESMO filtro da tela.
//
// Antes o CSV era montado no navegador e, para isso, a tela mandava TODAS as linhas
// filtradas junto com o HTML: 2 MB de página por abertura (medido 27/10/2026). Agora
// a tela só manda os totais e este endereço reconsulta o banco com os mesmos filtros
// na hora do clique. O arquivo sai igual; a página fica leve.
//
// Regra de dinheiro não muda: nada aqui soma ou altera; só lê e escreve texto.
export async function GET(req: NextRequest) {
  await requirePermissao('financeiro')
  const sp = req.nextUrl.searchParams
  const params: Record<string, string> = {}
  for (const [k, v] of sp.entries()) if (v) params[k] = v

  const supabase = await createServiceClient()
  const { ativa, operaveis } = await lojasDoUsuario().catch(() => ({ ativa: null, operaveis: [] as { id: string; nome: string }[] }))
  const lojaEfetiva = params.loja && (params.loja === 'sem' || params.loja === 'todas' || operaveis.some((l) => l.id === params.loja))
    ? params.loja
    : (ativa?.id ?? null)

  const linhas = await fetchAll<Record<string, unknown>>((from, to) =>
    aplicarFiltros(
      supabase.from('lancamentos')
        .select('descricao, pessoa_nome, data_vencimento, data_competencia, data_pagamento, valor, tipo, status, forma_pagamento, categoria, subcategoria')
        .order('data_vencimento', { ascending: true })
        .range(from, to) as never,
      params,
      { lojaEfetiva },
    ) as never,
  )

  const cabecalho = ['Descrição', 'Pessoa', 'Vencimento', 'Competência', 'Pagamento', 'Valor', 'Tipo', 'Situação', 'Forma', 'Categoria', 'Subcategoria']
  const campos = ['descricao', 'pessoa_nome', 'data_vencimento', 'data_competencia', 'data_pagamento', 'valor', 'tipo', 'status', 'forma_pagamento', 'categoria', 'subcategoria']
  const celula = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    // Sem isto, uma descrição com ponto e vírgula (ou aspas) desmonta a planilha.
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const corpo = [cabecalho.join(';'), ...linhas.map((l) => campos.map((c) => celula(l[c])).join(';'))].join('\r\n')
  const { de, ate } = periodoDe(params)
  const nome = 'financeiro_' + (de ?? 'tudo') + '_a_' + (ate ?? hojeSP()) + '.csv'

  // BOM para o Excel abrir com acento certo.
  return new Response('\ufeff' + corpo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}
