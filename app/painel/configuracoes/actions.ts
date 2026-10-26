'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { hashSenha, verificarSenhaLiberacao } from '@/lib/senha-liberacao'

type State = { ok: boolean; erro: string | null }

export async function salvarConfiguracoes(_prev: State, formData: FormData): Promise<State> {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()

  const valorEmpresa = {
    nome_empresa: formData.get('nome_empresa') as string,
    cnpj: formData.get('cnpj') as string,
    telefone: formData.get('telefone') as string,
    endereco: formData.get('endereco') as string,
    cidade: formData.get('cidade') as string,
    estado: formData.get('estado') as string,
    site: formData.get('site') as string,
    moeda: formData.get('moeda') as string,
    timezone: formData.get('timezone') as string,
  }

  const limiteDivergenciaRaw = parseFloat(formData.get('limite_divergencia') as string)
  const comissaoRaw = parseFloat(formData.get('comissao_percentual') as string)
  const valorPdv = {
    limite_divergencia: isNaN(limiteDivergenciaRaw) ? 0 : Math.max(0, limiteDivergenciaRaw),
    comissao_percentual: isNaN(comissaoRaw) ? 0 : Math.max(0, comissaoRaw),
    // horários do lembrete de fechar o caixa (loja fecha 19h na semana / 17h no sábado)
    hora_fechar_semana: (formData.get('hora_fechar_semana') as string) || '18:30',
    hora_fechar_sabado: (formData.get('hora_fechar_sabado') as string) || '16:30',
  }

  // Horários de entrega do bot WhatsApp — fonte de verdade lida pelo bot (info.mjs).
  const zona = (prefixo: string) => ({
    semana: ((formData.get(`entregas_${prefixo}_semana`) as string) ?? '').trim(),
    sabado: ((formData.get(`entregas_${prefixo}_sabado`) as string) ?? '').trim(),
  })
  const valorEntregas = {
    itaipava: zona('itaipava'),
    bairro: zona('bairro'),
    centro: zona('centro'),
  }

  const [r1, r2, r3] = await Promise.all([
    supabase.from('configuracoes').upsert({ chave: 'empresa', valor: valorEmpresa }, { onConflict: 'chave' }),
    supabase.from('configuracoes').upsert({ chave: 'pdv', valor: valorPdv }, { onConflict: 'chave' }),
    supabase.from('configuracoes').upsert({ chave: 'entregas', valor: valorEntregas }, { onConflict: 'chave' }),
  ])

  if (r1.error) return { ok: false, erro: r1.error.message }
  if (r2.error) return { ok: false, erro: r2.error.message }
  if (r3.error) return { ok: false, erro: r3.error.message }
  return { ok: true, erro: null }
}

// Troca da senha de liberação de devolução pelo próprio dono (tela Configurações).
// Guarda só o HASH scrypt — a senha em si não fica em lugar nenhum. Exige a senha
// atual para confirmar que é o dono mesmo (e não uma sessão de master deixada aberta).
export async function alterarSenhaLiberacao(_prev: State, formData: FormData): Promise<State> {
  await requirePermissao('usuarios')

  // Se a senha está travada por variável de ambiente (Vercel), trocar aqui não
  // surtiria efeito — a variável tem prioridade sobre o banco.
  if (process.env.SENHA_LIBERACAO_DEVOLUCAO) {
    return { ok: false, erro: 'A senha está travada por uma variável de ambiente (Vercel). Troque por lá, não aqui.' }
  }

  const atual = ((formData.get('senha_atual') as string) ?? '').trim()
  const nova = ((formData.get('senha_nova') as string) ?? '').trim()
  const confirma = ((formData.get('senha_confirma') as string) ?? '').trim()

  if (!atual) return { ok: false, erro: 'Digite a senha atual.' }
  if (!nova) return { ok: false, erro: 'Digite a nova senha.' }
  if (nova.length < 4) return { ok: false, erro: 'A nova senha precisa de pelo menos 4 caracteres.' }
  if (nova !== confirma) return { ok: false, erro: 'A nova senha e a confirmação não são iguais.' }

  const verificado = await verificarSenhaLiberacao(atual)
  if (!verificado.ok) {
    return {
      ok: false,
      erro: verificado.motivo === 'nao_configurada' ? 'Nenhuma senha configurada ainda — nada a trocar.' : 'Senha atual incorreta.',
    }
  }

  const supabase = await createServiceClient()
  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave: 'senha_liberacao_devolucao', valor: hashSenha(nova) }, { onConflict: 'chave' })
  if (error) return { ok: false, erro: error.message }
  return { ok: true, erro: null }
}
