// Teste da sequência de batidas do ponto — RPC `bater_ponto`.
//
// O RPC é o ÚNICO caminho de bater ponto (painel e Meu Perfil chamam ele), e ele
// decide o que é batida válida. Esta é a verificação rodável dessa regra: usa um
// usuário de mentira (uuid aleatório, não é perfil de ninguém) e apaga as linhas
// que gravou no fim. Não toca em dado de pessoa real.
//
// Rodar: node scripts/teste-ponto-sequencia.mjs
// Sai com código 1 se alguma transição responder diferente do esperado.

import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = fs.readFileSync('.env.local', 'utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim() ?? env.match(/SUPABASE_URL=(.+)/)?.[1]?.trim() ?? 'https://rbjwbfekkhebaschiqda.supabase.co'
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const s = createClient(url, key, { auth: { persistSession: false } })

const fake = crypto.randomUUID()
const bater = async (tipo) => {
  const { data, error } = await s.rpc('bater_ponto', { p_usuario_id: fake, p_tipo: tipo, p_loja_id: null })
  if (error) return { erro: error.message }
  return data.ok ? { ok: true } : { recusou: data.erro }
}

const casos = [
  ['entrada', 'ok'],
  ['entrada', 'já está em operação'],
  ['retorno', 'não está na pausa'],
  ['pausa', 'ok'],
  ['pausa', 'não está em operação'],
  ['retorno', 'ok'],
  ['saida', 'ok'],
  ['saida', 'não está em operação'],
  ['retorno', 'não está na pausa'],
  ['entrada', 'ok'],   // saiu pro almoço e voltou: nova entrada no mesmo dia vale
]

let falhas = 0
for (const [tipo, esperado] of casos) {
  const r = await bater(tipo)
  const veio = r.ok ? 'ok' : (r.recusou ?? 'ERRO: ' + r.erro)
  const passou = esperado === 'ok' ? veio === 'ok' : veio.toLowerCase().includes(esperado.toLowerCase())
  if (!passou) falhas++
  console.log(`${passou ? '✔' : '✖'} ${tipo.padEnd(8)} esperava "${esperado}" · veio "${veio}"`)
}

const { count } = await s.from('pontos').delete({ count: 'exact' }).eq('usuario_id', fake)
console.log(`\nlimpeza: ${count ?? 0} batida(s) de teste apagada(s)`)
console.log(falhas === 0 ? 'sequência do ponto: OK' : `${falhas} caso(s) fora do esperado`)
process.exit(falhas === 0 ? 0 : 1)
