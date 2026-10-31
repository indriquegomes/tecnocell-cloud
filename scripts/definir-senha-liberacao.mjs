// Define/troca a SENHA DE LIBERAÇÃO de devolução (hash scrypt em `configuracoes`).
// Uso:  node scripts/definir-senha-liberacao.mjs "novaSenha"
// Nada de senha em texto no repositório: só o hash vai pro banco.
// Alternativa recomendada: variável de ambiente SENHA_LIBERACAO_DEVOLUCAO na Vercel,
// que tem prioridade sobre este hash e troca sem deploy.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const senha = process.argv[2]
if (!senha || senha.trim().length < 6) {
  console.log('Uso: node scripts/definir-senha-liberacao.mjs "novaSenha"   (mínimo 6 caracteres)')
  process.exit(1)
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const salt = crypto.randomBytes(16)
const hash = crypto.scryptSync(senha.trim(), salt, 32)
const valor = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`

const { error } = await s.from('configuracoes').upsert({ chave: 'senha_liberacao_devolucao', valor }, { onConflict: 'chave' })
if (error) { console.log('ERRO ao gravar: ' + error.message); process.exit(1) }
console.log('senha de liberação definida (hash gravado em configuracoes.senha_liberacao_devolucao)')
console.log('tamanho da senha: ' + senha.trim().length + ' caracteres')
