import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'

// Senha de LIBERAÇÃO de devolução fora da regra (política do dono, 22/10).
// Guardada como HASH scrypt — a senha em si não fica em lugar nenhum.
//   1) variável de ambiente SENHA_LIBERACAO_DEVOLUCAO (texto): tem PRIORIDADE e é a
//      forma recomendada, porque troca no painel da Vercel sem deploy e não fica no banco;
//   2) fallback: linha `senha_liberacao_devolucao` em `configuracoes`, no formato
//      scrypt$salt$hash — usada quando a variável não está definida.
export type VerificacaoSenha = { ok: true } | { ok: false; motivo: 'nao_configurada' | 'errada' }

const CHAVE_CONFIG = 'senha_liberacao_devolucao'

export function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(senha, salt, 32)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

function confereHash(senha: string, guardado: string): boolean {
  const partes = guardado.split('$')
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false
  const salt = Buffer.from(partes[1], 'hex')
  const esperado = Buffer.from(partes[2], 'hex')
  let calculado: Buffer
  try {
    calculado = crypto.scryptSync(senha, salt, esperado.length)
  } catch {
    return false
  }
  return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado)
}

export async function verificarSenhaLiberacao(senha: string): Promise<VerificacaoSenha> {
  if (!senha) return { ok: false, motivo: 'errada' }

  const doAmbiente = process.env.SENHA_LIBERACAO_DEVOLUCAO
  if (doAmbiente) {
    const a = Buffer.from(senha)
    const b = Buffer.from(doAmbiente)
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
    return ok ? { ok: true } : { ok: false, motivo: 'errada' }
  }

  try {
    const sb = await createServiceClient()
    const { data } = await sb.from('configuracoes').select('valor').eq('chave', CHAVE_CONFIG).maybeSingle()
    const guardado = typeof data?.valor === 'string' ? data.valor : (data?.valor as { hash?: string } | null)?.hash
    if (!guardado) return { ok: false, motivo: 'nao_configurada' }
    return confereHash(senha, guardado) ? { ok: true } : { ok: false, motivo: 'errada' }
  } catch {
    return { ok: false, motivo: 'nao_configurada' }
  }
}

// A senha de liberação existe? (usado para decidir se a tela mostra o campo)
export async function senhaLiberacaoConfigurada(): Promise<boolean> {
  if (process.env.SENHA_LIBERACAO_DEVOLUCAO) return true
  try {
    const sb = await createServiceClient()
    const { data } = await sb.from('configuracoes').select('valor').eq('chave', CHAVE_CONFIG).maybeSingle()
    return !!data?.valor
  } catch {
    return false
  }
}
