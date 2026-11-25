// Dá a permissão `financeiro_lancar` a TODOS os perfis e cargos que já têm
// `financeiro` — para a trava nova (criar/editar/apagar lançamento manual) não
// bloquear ninguém que já trabalhava. Depois o dono pode revogar por pessoa/cargo
// em Usuários/Cargos, e aí só quem ele deixar cria lançamento solto.
//
// Backup + DESFAZER em docs/registros-banco/<ano-mês>/.
// Uso: node scripts/liberar-permissao-lancar.mjs        (aplica)
//      node scripts/liberar-permissao-lancar.mjs --ver  (só mostra)
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const CHAVE = 'financeiro_lancar'
const BASE = 'financeiro'
const soVer = process.argv.includes('--ver')

const alvos = []
for (const tabela of ['perfis', 'cargos']) {
  const { data, error } = await s.from(tabela).select('id, nome, permissoes, is_master')
  if (error) { console.log(`(${tabela} indisponível: ${error.message})`); continue }
  for (const r of data ?? []) {
    const perms = Array.isArray(r.permissoes) ? r.permissoes : []
    // master não precisa (tem tudo); quem não tem 'financeiro' não ganha nada
    if (r.is_master) continue
    if (!perms.includes(BASE) || perms.includes(CHAVE)) continue
    alvos.push({ tabela, id: r.id, nome: r.nome, permissoes: perms })
  }
}

if (!alvos.length) { console.log('Nada a fazer: todos que têm Financeiro já têm a permissão de lançar.'); process.exit(0) }
console.log(`Vou adicionar "${CHAVE}" em ${alvos.length} registro(s):`)
for (const a of alvos) console.log(`  ${a.tabela}: ${a.nome}`)
if (soVer) process.exit(0)

const agora = new Date().toISOString()
const dir = path.join('docs', 'registros-banco', agora.slice(0, 7))
fs.mkdirSync(dir, { recursive: true })
const carimbo = Date.now()
const backup = path.join(dir, `permissao-lancar-${carimbo}.json`)
fs.writeFileSync(backup, JSON.stringify({ quando: agora, chave: CHAVE, antes: alvos }, null, 2), 'utf8')

const desfazer = path.join(dir, `DESFAZER-permissao-lancar-${carimbo}.sql`)
const voltar = alvos.map((a) => `update public.${a.tabela} set permissoes = '${JSON.stringify(a.permissoes).replace(/'/g, "''")}'::jsonb where id = '${a.id}';`).join('\n')
fs.writeFileSync(desfazer, `-- Desfaz ${agora}\n-- Backup: ${path.basename(backup)}\n\n${voltar}\n`, 'utf8')

for (const a of alvos) {
  const { error } = await s.from(a.tabela).update({ permissoes: [...a.permissoes, CHAVE] }).eq('id', a.id)
  if (error) { console.error(`FALHOU ${a.tabela} ${a.nome}: ${error.message} (backup: ${backup})`); process.exit(1) }
}

console.log(`\nOK: ${alvos.length} registro(s) ganharam "${CHAVE}".`)
console.log('Backup: ' + backup)
console.log('Desfazer: ' + desfazer)
