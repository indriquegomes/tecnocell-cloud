import { createServiceClient } from '@/lib/supabase/server'

// Segredo de servidor: variável de ambiente primeiro (padrão do projeto), tabela
// `segredos` como alternativa quando a variável não está cadastrada no ambiente.
//
// A tabela existe porque `configuracoes` é legível por qualquer usuário logado —
// token de bot lá vazaria para a equipe inteira.
//
// ponytail: cache de 60s por instância. Trocar o segredo pode levar até 1 minuto
// para valer; para token de bot isso não muda nada.
const cache = new Map<string, { valor: string | null; ate: number }>()

export async function lerSegredo(nomeEnv: string, chaveTabela: string): Promise<string | null> {
  const doAmbiente = process.env[nomeEnv]
  if (doAmbiente) return doAmbiente

  const agora = Date.now()
  const guardado = cache.get(chaveTabela)
  if (guardado && guardado.ate > agora) return guardado.valor

  let valor: string | null = null
  try {
    const supabase = await createServiceClient()
    const { data } = await supabase.from('segredos').select('valor').eq('chave', chaveTabela).maybeSingle()
    valor = ((data as { valor?: string } | null)?.valor ?? null) || null
  } catch {
    // Tabela ainda não existe ou banco fora: cai no fallback de quem chamou.
    valor = null
  }
  cache.set(chaveTabela, { valor, ate: agora + 60_000 })
  return valor
}
