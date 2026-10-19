import { createClient } from '@supabase/supabase-js'

// Mesmo padrão do cadastro Android: sem exigir caractere especial.
export function regrasSenhaCliente(senha: string) {
  return [
    { texto: '8 caracteres', ok: senha.length >= 8 },
    { texto: 'Uma maiúscula', ok: /[A-Z]/.test(senha) },
    { texto: 'Uma minúscula', ok: /[a-z]/.test(senha) },
    { texto: 'Um número', ok: /\d/.test(senha) },
  ]
}

// Sessão só em memória: nunca lê ou substitui os cookies de funcionário do ERP.
export function criarRecuperacaoCliente() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'tecnocell-cliente-recuperacao' },
  })
}

export async function validarLinkRecuperacao(client: ReturnType<typeof criarRecuperacaoCliente>, href: string) {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.slice(1))
  if (hash.has('error') || url.searchParams.has('error')) throw new Error('LINK_INVALIDO')
  const tokenHash = url.searchParams.get('token_hash')
  if (tokenHash && url.searchParams.get('type') === 'recovery') {
    const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    if (error || !data.session) throw new Error('LINK_INVALIDO')
    return
  }
  const access = hash.get('access_token'), refresh = hash.get('refresh_token')
  if (hash.get('type') !== 'recovery' || !access || !refresh) throw new Error('LINK_INVALIDO')
  const { data, error } = await client.auth.setSession({ access_token: access, refresh_token: refresh })
  if (error || !data.session) throw new Error('LINK_INVALIDO')
}
