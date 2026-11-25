import { createServiceClient } from '@/lib/supabase/server'

// Monitoramento do que quebra enquanto a loja trabalha.
//
// Regra desta função: NADA de dado de cliente. Nome de pessoa, valor, telefone,
// CPF, IMEI e chave não entram aqui — só o suficiente para o dono reconhecer o
// problema ("[PDV] venda não finalizou") e achá-lo depois. Quem quiser o valor
// abre a venda pelo id, no sistema.
//
// Nunca lança: erro de monitoramento não pode derrubar a operação observada.

export type OrigemErro = 'tela' | 'servidor' | 'vigia'
export type GravidadeErro = 'erro' | 'atencao'

export type ErroNovo = {
  origem: OrigemErro
  gravidade?: GravidadeErro
  tela?: string | null
  titulo: string
  mensagem?: string | null
  usuarioId?: string | null
  usuarioEmail?: string | null
  lojaId?: string | null
  digest?: string | null
  contexto?: Record<string, unknown>
}

// Texto e agrupamento moram em lib/erros-texto.ts (sem dependência nenhuma) para
// poderem ser testados fora do Next. Importados aqui e reexportados porque quem
// grava erro já importa deste arquivo.
import { agrupar, limparTexto } from '@/lib/erros-texto'
export { limparTexto, agrupar }

export async function registrarErro(e: ErroNovo): Promise<void> {
  try {
    const supabase = await createServiceClient()
    const titulo = limparTexto(e.titulo) ?? 'problema sem descrição'
    // O hash sai do título JÁ limpo: gravar o cru faria a mesma linha virar dois
    // grupos quando o texto original tivesse espaço duplicado.
    const { error } = await supabase.from('erros_app').insert({
      origem: e.origem,
      gravidade: e.gravidade ?? 'erro',
      tela: e.tela ?? null,
      titulo,
      mensagem: limparTexto(e.mensagem),
      agrupamento: agrupar(e.tela, titulo),
      usuario_id: e.usuarioId ?? null,
      usuario_email: e.usuarioEmail ?? null,
      loja_id: e.lojaId ?? null,
      digest: e.digest ?? null,
      contexto: e.contexto ?? {},
    })
    // O supabase-js NÃO lança quando o insert falha: devolve `error`. Sem este
    // aviso, tabela sem a migration aplicada perderia 100% dos erros calada —
    // e o sintoma seria "o monitoramento nunca acusa nada".
    if (error) console.error('[erros] não gravou:', error.message)
  } catch (falha) {
    console.error('[erros] não gravou:', falha instanceof Error ? falha.message : String(falha))
  }
}
